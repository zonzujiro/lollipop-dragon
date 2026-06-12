use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;

const IGNORED_NAMES: [&str; 3] = ["node_modules", ".git", ".markreview"];
const MARKDOWN_EXTENSIONS: [&str; 2] = ["md", "markdown"];

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
fn dragon_agent_runtime_available() -> bool {
    false
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
            dragon_read_directory_tree
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lollipop Dragon");
}
