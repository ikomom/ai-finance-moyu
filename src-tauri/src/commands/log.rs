//! Diagnostic, memory log retrieval, and log configuration IPC commands.

use tauri::AppHandle;
use crate::logger;

/// Let a window write into the process log.
///
/// A transparent widget can fail in ways that are invisible on screen, and the
/// webview console is not reachable from the terminal. This bridge makes the
/// frontend's own view of what it rendered observable from the dev log.
#[tauri::command]
pub fn frontend_log(msg: String) {
    log::info!(target: "FRONTEND", "{msg}");
}

#[tauri::command]
pub fn get_recent_logs(target_filter: Option<String>, level_filter: Option<String>) -> Vec<logger::LogEntry> {
    logger::get_recent_entries(target_filter.as_deref(), level_filter.as_deref())
}

#[tauri::command]
pub fn open_log_dir(app: AppHandle) -> Result<(), String> {
    logger::open_log_directory(&app)
}

#[tauri::command]
pub fn clear_memory_logs() {
    logger::clear_memory_entries();
}

#[tauri::command]
pub fn set_log_level(level: String) {
    logger::set_level(&level);
}
