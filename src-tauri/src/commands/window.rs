//! Window operations, context menu, docking, and URL opening IPC commands.

use tauri::{AppHandle, Manager};

use crate::config::VisibilityMode;
use crate::tray;
use crate::window::{apply_visibility_mode, open_settings, set_dock_collapsed_inner, DISPLAY};

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings(&app)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn set_dock_collapsed(app: AppHandle, collapsed: bool) -> Result<(), String> {
    set_dock_collapsed_inner(&app, collapsed)
}

#[tauri::command]
pub fn set_visibility_mode(app: AppHandle, mode: VisibilityMode) -> Result<(), String> {
    apply_visibility_mode(&app, mode)
}

#[tauri::command]
pub fn show_context_menu(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(DISPLAY) {
        tray::show_context_menu(&app, &win).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
