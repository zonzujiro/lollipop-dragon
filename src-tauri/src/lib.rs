use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::DialogExt;

const IGNORED_NAMES: [&str; 3] = ["node_modules", ".git", ".markreview"];
const MARKDOWN_EXTENSIONS: [&str; 2] = ["md", "markdown"];
const AGENT_COMMAND_ENV: &str = "DRAGON_AGENT_COMMAND";
const AGENT_OUTPUT_LIMIT: usize = 20_000;

static AGENT_RUN_COUNTER: AtomicU64 = AtomicU64::new(1);
static AGENT_RUNS: OnceLock<Mutex<HashMap<String, AgentRunProcess>>> = OnceLock::new();

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

struct AgentRunProcess {
    child: Child,
    output: Arc<Mutex<String>>,
    output_threads: Vec<JoinHandle<()>>,
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

fn configured_agent_command() -> Result<String, String> {
    let command = env::var(AGENT_COMMAND_ENV)
        .map_err(|_| format!("{AGENT_COMMAND_ENV} is not configured"))?
        .trim()
        .to_string();
    if command.is_empty() {
        return Err(format!("{AGENT_COMMAND_ENV} is empty"));
    }

    Ok(command)
}

fn create_agent_run_id() -> String {
    let counter = AGENT_RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    format!("agent-{timestamp}-{counter}")
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

fn is_ignored(name: &str) -> bool {
    name.starts_with('.') || IGNORED_NAMES.contains(&name)
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            MARKDOWN_EXTENSIONS.contains(&extension.to_lowercase().as_str())
        })
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
fn dragon_agent_runtime_available() -> bool {
    configured_agent_command().is_ok()
}

#[tauri::command]
fn dragon_open_text_file(app: tauri::AppHandle) -> Result<Option<NativePathTarget>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md", "markdown"])
        .blocking_pick_file();

    Ok(selected
        .and_then(|file_path| file_path.as_path().map(|path| path.to_path_buf()))
        .map(path_target_from_path))
}

#[tauri::command]
fn dragon_open_directory(app: tauri::AppHandle) -> Result<Option<NativePathTarget>, String> {
    let selected = app.dialog().file().blocking_pick_folder();

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
fn dragon_start_agent_run(request: AgentRunRequestPayload) -> Result<String, String> {
    let command = configured_agent_command()?;
    let run_id = create_agent_run_id();
    let mut process = shell_command(&command);
    process.stdin(Stdio::piped());
    process.stdout(Stdio::piped());
    process.stderr(Stdio::piped());

    if let Some(workspace_root_path) = request.workspace_root_path {
        if !workspace_root_path.trim().is_empty() {
            process.current_dir(workspace_root_path);
        }
    }

    let mut child = process.spawn().map_err(|error| error.to_string())?;
    let output = Arc::new(Mutex::new(String::new()));
    let mut output_threads = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        output_threads.push(spawn_agent_output_reader(stdout, Arc::clone(&output)));
    }
    if let Some(stderr) = child.stderr.take() {
        output_threads.push(spawn_agent_output_reader(stderr, Arc::clone(&output)));
    }
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(request.prompt.as_bytes())
            .map_err(|error| error.to_string())?;
        stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    }

    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    locked_runs.insert(
        run_id.clone(),
        AgentRunProcess {
            child,
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
            exit_code: exit_status.code(),
            message: None,
            output,
        });
    }

    let exit_code = exit_status.code();
    let message = exit_code
        .map(|code| format!("Agent exited with code {code}"))
        .unwrap_or_else(|| "Agent exited without an exit code".to_string());
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
            dragon_open_text_file,
            dragon_open_directory,
            dragon_read_text_file,
            dragon_write_text_file,
            dragon_read_directory_tree,
            dragon_start_agent_run,
            dragon_stop_agent_run,
            dragon_get_agent_run_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lollipop Dragon");
}
