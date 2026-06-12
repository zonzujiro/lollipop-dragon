#[tauri::command]
fn dragon_runtime_ping() -> &'static str {
    "ok"
}

#[tauri::command]
fn dragon_agent_runtime_available() -> bool {
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            dragon_runtime_ping,
            dragon_agent_runtime_available
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lollipop Dragon");
}
