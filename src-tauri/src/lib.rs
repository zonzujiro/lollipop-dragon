use notify::{Config as NotifyConfig, RecommendedWatcher, RecursiveMode, Watcher};
use portable_pty::{native_pty_system, CommandBuilder, ExitStatus, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const IGNORED_NAMES: [&str; 3] = ["node_modules", ".git", ".markreview"];
const MARKDOWN_EXTENSIONS: [&str; 2] = ["md", "markdown"];
const AGENT_COMMAND_ENV: &str = "DRAGON_AGENT_COMMAND";
const AGENT_OUTPUT_LIMIT: usize = 20_000;
const AGENT_CONFIG_FILE: &str = "agent-config.json";
const AGENT_TEST_OUTPUT_LIMIT: usize = 8_000;
const KNOWN_AGENT_CLIS: [KnownAgentCli; 2] = [
    KnownAgentCli {
        id: "codex",
        label: "Codex",
        executable: "codex",
    },
    KnownAgentCli {
        id: "claude",
        label: "Claude",
        executable: "claude",
    },
];

static AGENT_RUN_COUNTER: AtomicU64 = AtomicU64::new(1);
static AGENT_RUNS: OnceLock<Mutex<HashMap<String, AgentRunProcess>>> = OnceLock::new();
static PATH_WATCH_COUNTER: AtomicU64 = AtomicU64::new(1);
static PATH_WATCHES: OnceLock<Mutex<HashMap<String, PathWatch>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(tag = "kind")]
enum NativeFileTreeNode {
    #[serde(rename = "file")]
    File { name: String, path: String },
    #[serde(rename = "directory")]
    Directory {
        name: String,
        path: String,
        children: Vec<NativeFileTreeNode>,
    },
}

#[derive(Serialize)]
struct NativePathTarget {
    path: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRunRequestPayload {
    prompt: String,
    workspace_root_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRunStatusPayload {
    status: String,
    exit_code: Option<i32>,
    message: Option<String>,
    output: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentConfigFile {
    command: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentConfigPayload {
    command: Option<String>,
    source: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentCliDetectionPayload {
    id: String,
    label: String,
    command: String,
    path: Option<String>,
    available: bool,
    version: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentCommandTestPayload {
    ok: bool,
    message: String,
    output: String,
}

struct KnownAgentCli {
    id: &'static str,
    label: &'static str,
    executable: &'static str,
}

struct AgentRunProcess {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    output: Arc<Mutex<String>>,
    output_threads: Vec<JoinHandle<()>>,
}

struct PathWatch {
    _watcher: RecommendedWatcher,
    pending_change: Arc<AtomicBool>,
}

fn path_target_from_path(path: PathBuf) -> NativePathTarget {
    let name = path
        .file_name()
        .map(|file_name| file_name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    NativePathTarget {
        path: path.to_string_lossy().to_string(),
        name,
    }
}

fn active_agent_runs() -> &'static Mutex<HashMap<String, AgentRunProcess>> {
    AGENT_RUNS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn active_path_watches() -> &'static Mutex<HashMap<String, PathWatch>> {
    PATH_WATCHES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn agent_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(config_dir.join(AGENT_CONFIG_FILE))
}

fn read_saved_agent_command(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let config_path = agent_config_path(app)?;
    if !config_path.exists() {
        return Ok(None);
    }

    let raw_config = fs::read_to_string(config_path).map_err(|error| error.to_string())?;
    let config: AgentConfigFile =
        serde_json::from_str(&raw_config).map_err(|error| error.to_string())?;
    let command = config.command.trim().to_string();
    if command.is_empty() {
        return Ok(None);
    }

    Ok(Some(command))
}

fn save_agent_command(app: &tauri::AppHandle, command: String) -> Result<(), String> {
    let trimmed_command = command.trim().to_string();
    if trimmed_command.is_empty() {
        return Err("Agent command cannot be empty".to_string());
    }

    let config_path = agent_config_path(app)?;
    let config_dir = config_path
        .parent()
        .ok_or_else(|| "Agent config directory is unavailable".to_string())?;
    fs::create_dir_all(config_dir).map_err(|error| error.to_string())?;
    let raw_config = serde_json::to_string_pretty(&AgentConfigFile {
        command: trimmed_command,
    })
    .map_err(|error| error.to_string())?;
    fs::write(config_path, raw_config).map_err(|error| error.to_string())
}

fn clear_saved_agent_command(app: &tauri::AppHandle) -> Result<(), String> {
    let config_path = agent_config_path(app)?;
    if config_path.exists() {
        fs::remove_file(config_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn configured_agent_command(app: &tauri::AppHandle) -> Result<(String, String), String> {
    if let Some(command) = read_saved_agent_command(app)? {
        return Ok((command, "config".to_string()));
    }

    let command = env::var(AGENT_COMMAND_ENV)
        .map_err(|_| format!("{AGENT_COMMAND_ENV} is not configured"))?
        .trim()
        .to_string();
    if command.is_empty() {
        return Err(format!("{AGENT_COMMAND_ENV} is empty"));
    }

    Ok((command, "environment".to_string()))
}

fn append_agent_output(output: &Arc<Mutex<String>>, chunk: &str) {
    if chunk.is_empty() {
        return;
    }

    if let Ok(mut locked_output) = output.lock() {
        locked_output.push_str(chunk);
        if locked_output.len() > AGENT_OUTPUT_LIMIT {
            let keep_from = locked_output.len() - AGENT_OUTPUT_LIMIT;
            let trimmed = locked_output
                .char_indices()
                .find(|(index, _character)| *index >= keep_from)
                .map(|(index, _character)| index)
                .unwrap_or(keep_from);
            locked_output.drain(..trimmed);
        }
    }
}

fn read_agent_output(output: &Arc<Mutex<String>>) -> String {
    output
        .lock()
        .map(|locked_output| locked_output.clone())
        .unwrap_or_else(|error| format!("Failed to read agent output: {error}"))
}

fn spawn_agent_output_reader<R>(mut reader: R, output: Arc<Mutex<String>>) -> JoinHandle<()>
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut buffer = [0; 4096];
        loop {
            let bytes_read = match reader.read(&mut buffer) {
                Ok(0) => return,
                Ok(bytes_read) => bytes_read,
                Err(error) => {
                    append_agent_output(
                        &output,
                        &format!("\n[agent output read failed: {error}]\n"),
                    );
                    return;
                }
            };
            let chunk = String::from_utf8_lossy(&buffer[..bytes_read]);
            append_agent_output(&output, &chunk);
        }
    })
}

fn join_agent_output_threads(process: AgentRunProcess) -> String {
    for output_thread in process.output_threads {
        if output_thread.join().is_err() {
            append_agent_output(&process.output, "\n[agent output reader panicked]\n");
        }
    }

    read_agent_output(&process.output)
}

fn create_agent_run_id() -> String {
    let counter = AGENT_RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    format!("agent-{timestamp}-{counter}")
}

fn create_path_watch_id() -> String {
    let counter = PATH_WATCH_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    format!("watch-{timestamp}-{counter}")
}

fn shell_command(command: &str) -> Command {
    if cfg!(target_os = "windows") {
        let mut process = Command::new("cmd");
        process.arg("/C").arg(command);
        return process;
    }

    let mut process = Command::new("sh");
    process.arg("-lc").arg(command);
    process
}

fn shell_pty_command(command: &str) -> CommandBuilder {
    if cfg!(target_os = "windows") {
        let mut process = CommandBuilder::new("cmd");
        process.arg("/C");
        process.arg(command);
        return process;
    }

    let mut process = CommandBuilder::new("sh");
    process.arg("-lc");
    process.arg(command);
    process
}

fn pty_exit_code(status: &ExitStatus) -> Option<i32> {
    i32::try_from(status.exit_code()).ok()
}

fn pty_exit_message(status: &ExitStatus) -> String {
    status
        .signal()
        .map(|signal| format!("Agent terminated by {signal}"))
        .unwrap_or_else(|| format!("Agent exited with code {}", status.exit_code()))
}

fn executable_candidates(executable: &str) -> Vec<String> {
    if !cfg!(target_os = "windows") {
        return vec![executable.to_string()];
    }

    let executable_path = Path::new(executable);
    if executable_path.extension().is_some() {
        return vec![executable.to_string()];
    }

    let path_ext = env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string());
    let mut candidates = vec![executable.to_string()];
    for extension in path_ext.split(';') {
        let trimmed_extension = extension.trim();
        if trimmed_extension.is_empty() {
            continue;
        }
        candidates.push(format!("{executable}{trimmed_extension}"));
    }
    candidates
}

fn command_search_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = env::var_os("PATH")
        .map(|raw_path| env::split_paths(&raw_path).collect())
        .unwrap_or_default();

    if cfg!(target_os = "macos") {
        paths.push(PathBuf::from("/opt/homebrew/bin"));
        paths.push(PathBuf::from("/usr/local/bin"));
    }

    paths
}

fn find_executable(executable: &str) -> Option<PathBuf> {
    let executable_path = Path::new(executable);
    if executable_path.is_absolute() && executable_path.is_file() {
        return Some(executable_path.to_path_buf());
    }

    for directory_path in command_search_paths() {
        for candidate in executable_candidates(executable) {
            let candidate_path = directory_path.join(candidate);
            if candidate_path.is_file() {
                return Some(candidate_path);
            }
        }
    }

    None
}

fn truncate_output(output: String, limit: usize) -> String {
    if output.len() <= limit {
        return output;
    }

    let keep_from = output.len() - limit;
    let trimmed = output
        .char_indices()
        .find(|(index, _character)| *index >= keep_from)
        .map(|(index, _character)| index)
        .unwrap_or(keep_from);
    output[trimmed..].to_string()
}

fn probe_command(command: &str) -> AgentCommandTestPayload {
    let test_command = format!("{command} --version");
    let output = shell_command(&test_command).output();
    match output {
        Ok(result) => {
            let stdout = String::from_utf8_lossy(&result.stdout);
            let stderr = String::from_utf8_lossy(&result.stderr);
            let combined_output =
                truncate_output(format!("{stdout}{stderr}"), AGENT_TEST_OUTPUT_LIMIT);
            if result.status.success() {
                return AgentCommandTestPayload {
                    ok: true,
                    message: "Command responded to --version".to_string(),
                    output: combined_output,
                };
            }

            AgentCommandTestPayload {
                ok: false,
                message: result
                    .status
                    .code()
                    .map(|code| format!("Command exited with code {code}"))
                    .unwrap_or_else(|| "Command exited without an exit code".to_string()),
                output: combined_output,
            }
        }
        Err(error) => AgentCommandTestPayload {
            ok: false,
            message: error.to_string(),
            output: String::new(),
        },
    }
}

fn is_ignored(name: &str) -> bool {
    name.starts_with('.') || IGNORED_NAMES.contains(&name)
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| MARKDOWN_EXTENSIONS.contains(&extension.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn build_native_file_tree(
    directory_path: &Path,
    base_path: &str,
) -> Result<Vec<NativeFileTreeNode>, String> {
    let mut directories = Vec::new();
    let mut files = Vec::new();
    let entries = fs::read_dir(directory_path).map_err(|error| error.to_string())?;

    for entry_result in entries {
        let entry = entry_result.map_err(|error| error.to_string())?;
        let file_type = entry.file_type().map_err(|error| error.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if is_ignored(&name) {
            continue;
        }

        let path = if base_path.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", base_path, name)
        };
        let entry_path = entry.path();

        if file_type.is_dir() {
            let children = build_native_file_tree(&entry_path, &path)?;
            if !children.is_empty() {
                directories.push(NativeFileTreeNode::Directory {
                    name,
                    path,
                    children,
                });
            }
        } else if file_type.is_file() && is_markdown_file(&entry_path) {
            files.push(NativeFileTreeNode::File { name, path });
        }
    }

    directories.sort_by_key(|node| match node {
        NativeFileTreeNode::Directory { name, .. } => name.clone(),
        NativeFileTreeNode::File { name, .. } => name.clone(),
    });
    files.sort_by_key(|node| match node {
        NativeFileTreeNode::Directory { name, .. } => name.clone(),
        NativeFileTreeNode::File { name, .. } => name.clone(),
    });
    directories.extend(files);

    Ok(directories)
}

#[tauri::command]
fn dragon_runtime_ping() -> &'static str {
    "ok"
}

#[tauri::command]
fn dragon_agent_runtime_available(app: tauri::AppHandle) -> bool {
    configured_agent_command(&app).is_ok()
}

#[tauri::command]
fn dragon_get_agent_config(app: tauri::AppHandle) -> Result<AgentConfigPayload, String> {
    match read_saved_agent_command(&app)? {
        Some(command) => Ok(AgentConfigPayload {
            command: Some(command),
            source: Some("config".to_string()),
        }),
        None => match env::var(AGENT_COMMAND_ENV) {
            Ok(command) if !command.trim().is_empty() => Ok(AgentConfigPayload {
                command: Some(command.trim().to_string()),
                source: Some("environment".to_string()),
            }),
            _ => Ok(AgentConfigPayload {
                command: None,
                source: None,
            }),
        },
    }
}

#[tauri::command]
fn dragon_save_agent_config(app: tauri::AppHandle, command: String) -> Result<(), String> {
    save_agent_command(&app, command)
}

#[tauri::command]
fn dragon_clear_agent_config(app: tauri::AppHandle) -> Result<(), String> {
    clear_saved_agent_command(&app)
}

#[tauri::command]
fn dragon_detect_agent_clis() -> Vec<AgentCliDetectionPayload> {
    KNOWN_AGENT_CLIS
        .iter()
        .map(|known_cli| {
            let path = find_executable(known_cli.executable);
            let available = path.is_some();
            let version = path
                .as_ref()
                .and_then(|_path| {
                    let probe_result = probe_command(known_cli.executable);
                    if probe_result.ok {
                        return Some(probe_result.output.trim().to_string());
                    }
                    None
                })
                .filter(|output| !output.is_empty());

            AgentCliDetectionPayload {
                id: known_cli.id.to_string(),
                label: known_cli.label.to_string(),
                command: known_cli.executable.to_string(),
                path: path.map(|path| path.to_string_lossy().to_string()),
                available,
                version,
            }
        })
        .collect()
}

#[tauri::command]
fn dragon_test_agent_command(command: String) -> Result<AgentCommandTestPayload, String> {
    let trimmed_command = command.trim().to_string();
    if trimmed_command.is_empty() {
        return Err("Agent command cannot be empty".to_string());
    }

    Ok(probe_command(&trimmed_command))
}

#[tauri::command]
fn dragon_open_text_file(window: tauri::Window) -> Result<Option<NativePathTarget>, String> {
    let selected = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_pick_file();

    Ok(selected
        .and_then(|file_path| file_path.as_path().map(|path| path.to_path_buf()))
        .map(path_target_from_path))
}

#[tauri::command]
fn dragon_open_directory(window: tauri::Window) -> Result<Option<NativePathTarget>, String> {
    let selected = window
        .dialog()
        .file()
        .set_parent(&window)
        .blocking_pick_folder();

    Ok(selected
        .and_then(|file_path| file_path.as_path().map(|path| path.to_path_buf()))
        .map(path_target_from_path))
}

#[tauri::command]
fn dragon_read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn dragon_write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn dragon_read_directory_tree(path: String) -> Result<Vec<NativeFileTreeNode>, String> {
    build_native_file_tree(Path::new(&path), "")
}

#[tauri::command]
fn dragon_start_path_watch(path: String, recursive: bool) -> Result<String, String> {
    let watch_path = PathBuf::from(path);
    if !watch_path.exists() {
        return Err("Path to watch does not exist".to_string());
    }

    let watch_id = create_path_watch_id();
    let pending_change = Arc::new(AtomicBool::new(false));
    let watcher_pending_change = Arc::clone(&pending_change);
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<notify::Event>| match result {
            Ok(_event) => {
                watcher_pending_change.store(true, Ordering::Relaxed);
            }
            Err(error) => {
                eprintln!("[path watch] watch failed: {error}");
                watcher_pending_change.store(true, Ordering::Relaxed);
            }
        },
        NotifyConfig::default(),
    )
    .map_err(|error| error.to_string())?;

    let recursive_mode = if recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };
    watcher
        .watch(&watch_path, recursive_mode)
        .map_err(|error| error.to_string())?;

    let watches = active_path_watches();
    let mut locked_watches = watches.lock().map_err(|error| error.to_string())?;
    locked_watches.insert(
        watch_id.clone(),
        PathWatch {
            _watcher: watcher,
            pending_change,
        },
    );

    Ok(watch_id)
}

#[tauri::command]
fn dragon_take_path_watch_events(watch_id: String) -> Result<bool, String> {
    let watches = active_path_watches();
    let locked_watches = watches.lock().map_err(|error| error.to_string())?;
    let watch = locked_watches
        .get(&watch_id)
        .ok_or_else(|| "Path watch is no longer available".to_string())?;
    Ok(watch.pending_change.swap(false, Ordering::Relaxed))
}

#[tauri::command]
fn dragon_stop_path_watch(watch_id: String) -> Result<(), String> {
    let watches = active_path_watches();
    let mut locked_watches = watches.lock().map_err(|error| error.to_string())?;
    locked_watches.remove(&watch_id);
    Ok(())
}

#[tauri::command]
fn dragon_start_agent_run(
    app: tauri::AppHandle,
    request: AgentRunRequestPayload,
) -> Result<String, String> {
    let (command, _source) = configured_agent_command(&app)?;
    let run_id = create_agent_run_id();
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 30,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    let mut process = shell_pty_command(&command);

    if let Some(workspace_root_path) = request.workspace_root_path {
        if !workspace_root_path.trim().is_empty() {
            process.cwd(workspace_root_path);
        }
    }

    let child = pty_pair
        .slave
        .spawn_command(process)
        .map_err(|error| error.to_string())?;
    let output = Arc::new(Mutex::new(String::new()));
    let reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let output_threads = vec![spawn_agent_output_reader(reader, Arc::clone(&output))];
    let mut writer = pty_pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    writer
        .write_all(request.prompt.as_bytes())
        .map_err(|error| error.to_string())?;
    writer
        .write_all(b"\r\n")
        .map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())?;

    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    locked_runs.insert(
        run_id.clone(),
        AgentRunProcess {
            child,
            master: pty_pair.master,
            writer,
            output,
            output_threads,
        },
    );

    Ok(run_id)
}

#[tauri::command]
fn dragon_stop_agent_run(run_id: String) -> Result<(), String> {
    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    if let Some(mut process) = locked_runs.remove(&run_id) {
        if process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            process.child.kill().map_err(|error| error.to_string())?;
        }
        let _status = process.child.wait().map_err(|error| error.to_string())?;
        let _output = join_agent_output_threads(process);
    }

    Ok(())
}

#[tauri::command]
fn dragon_send_agent_run_input(run_id: String, input: String) -> Result<(), String> {
    let trimmed_input = input.trim_end_matches(['\r', '\n']);
    if trimmed_input.is_empty() {
        return Ok(());
    }

    dragon_send_agent_run_data(run_id, format!("{trimmed_input}\r\n"))
}

#[tauri::command]
fn dragon_send_agent_run_data(run_id: String, data: String) -> Result<(), String> {
    if data.is_empty() {
        return Ok(());
    }

    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    let process = locked_runs
        .get_mut(&run_id)
        .ok_or_else(|| "Agent run is no longer available".to_string())?;
    process
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    process.writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn dragon_resize_agent_run_terminal(run_id: String, cols: u16, rows: u16) -> Result<(), String> {
    if cols == 0 || rows == 0 {
        return Err("Terminal size must be greater than zero".to_string());
    }

    let runs = active_agent_runs();
    let locked_runs = runs.lock().map_err(|error| error.to_string())?;
    let process = locked_runs
        .get(&run_id)
        .ok_or_else(|| "Agent run is no longer available".to_string())?;
    process
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn dragon_get_agent_run_status(run_id: String) -> Result<AgentRunStatusPayload, String> {
    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    let wait_status = if let Some(process) = locked_runs.get_mut(&run_id) {
        process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
    } else {
        return Ok(AgentRunStatusPayload {
            status: "not_found".to_string(),
            exit_code: None,
            message: Some("Agent run is no longer available".to_string()),
            output: String::new(),
        });
    };
    let output = locked_runs
        .get(&run_id)
        .map(|process| read_agent_output(&process.output))
        .unwrap_or_default();

    let Some(exit_status) = wait_status else {
        return Ok(AgentRunStatusPayload {
            status: "running".to_string(),
            exit_code: None,
            message: None,
            output,
        });
    };

    let process = locked_runs
        .remove(&run_id)
        .ok_or_else(|| "Agent run is no longer available".to_string())?;
    let output = join_agent_output_threads(process);
    if exit_status.success() {
        return Ok(AgentRunStatusPayload {
            status: "completed".to_string(),
            exit_code: pty_exit_code(&exit_status),
            message: None,
            output,
        });
    }

    let exit_code = pty_exit_code(&exit_status);
    let message = pty_exit_message(&exit_status);
    Ok(AgentRunStatusPayload {
        status: "failed".to_string(),
        exit_code,
        message: Some(message),
        output,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            dragon_runtime_ping,
            dragon_agent_runtime_available,
            dragon_get_agent_config,
            dragon_save_agent_config,
            dragon_clear_agent_config,
            dragon_detect_agent_clis,
            dragon_test_agent_command,
            dragon_open_text_file,
            dragon_open_directory,
            dragon_read_text_file,
            dragon_write_text_file,
            dragon_read_directory_tree,
            dragon_start_path_watch,
            dragon_take_path_watch_events,
            dragon_stop_path_watch,
            dragon_start_agent_run,
            dragon_stop_agent_run,
            dragon_send_agent_run_input,
            dragon_send_agent_run_data,
            dragon_resize_agent_run_terminal,
            dragon_get_agent_run_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lollipop Dragon");
}
