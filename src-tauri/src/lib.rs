use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::DialogExt;

const IGNORED_NAMES: [&str; 3] = ["node_modules", ".git", ".markreview"];
const MARKDOWN_EXTENSIONS: [&str; 2] = ["md", "markdown"];
const AGENT_COMMAND_ENV: &str = "DRAGON_AGENT_COMMAND";

static AGENT_RUN_COUNTER: AtomicU64 = AtomicU64::new(1);
static AGENT_RUNS: OnceLock<Mutex<HashMap<String, Child>>> = OnceLock::new();

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

fn active_agent_runs() -> &'static Mutex<HashMap<String, Child>> {
    AGENT_RUNS.get_or_init(|| Mutex::new(HashMap::new()))
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
    process.stdout(Stdio::null());
    process.stderr(Stdio::null());

    if let Some(workspace_root_path) = request.workspace_root_path {
        if !workspace_root_path.trim().is_empty() {
            process.current_dir(workspace_root_path);
        }
    }

    let mut child = process.spawn().map_err(|error| error.to_string())?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(request.prompt.as_bytes())
            .map_err(|error| error.to_string())?;
        stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    }

    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    locked_runs.insert(run_id.clone(), child);

    Ok(run_id)
}

#[tauri::command]
fn dragon_stop_agent_run(run_id: String) -> Result<(), String> {
    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    if let Some(mut child) = locked_runs.remove(&run_id) {
        if child.try_wait().map_err(|error| error.to_string())?.is_none() {
            child.kill().map_err(|error| error.to_string())?;
        }
        let _status = child.wait().map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn dragon_get_agent_run_status(run_id: String) -> Result<AgentRunStatusPayload, String> {
    let runs = active_agent_runs();
    let mut locked_runs = runs.lock().map_err(|error| error.to_string())?;
    let wait_status = if let Some(child) = locked_runs.get_mut(&run_id) {
        child.try_wait().map_err(|error| error.to_string())?
    } else {
        return Ok(AgentRunStatusPayload {
            status: "not_found".to_string(),
            exit_code: None,
            message: Some("Agent run is no longer available".to_string()),
        });
    };

    let Some(exit_status) = wait_status else {
        return Ok(AgentRunStatusPayload {
            status: "running".to_string(),
            exit_code: None,
            message: None,
        });
    };

    locked_runs.remove(&run_id);
    if exit_status.success() {
        return Ok(AgentRunStatusPayload {
            status: "completed".to_string(),
            exit_code: exit_status.code(),
            message: None,
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
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
