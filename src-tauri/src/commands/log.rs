//! Diagnostic, memory log retrieval, and log configuration IPC commands.

use tauri::AppHandle;
use crate::logger;

/// Let a window write into the process log.
///
/// The frontend is a thin presentation layer, so anything it reports belongs to
/// the same `SYSTEM` bucket as the rest of the app's own diagnostics.
#[tauri::command]
pub fn frontend_log(msg: String) {
    log::info!(target: "SYSTEM", "[前端] {msg}");
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
