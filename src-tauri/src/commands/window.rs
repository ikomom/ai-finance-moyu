//! Window operations, context menu, docking, and URL opening IPC commands.

use tauri::{AppHandle, Manager};

use crate::config::VisibilityMode;
use crate::tray;
use crate::window::{apply_visibility_mode, open_settings, set_dock_collapsed_inner, DISPLAY};

/// Open the settings window from the frontend.
///
/// These two window-opening commands are deliberately `async`. A synchronous
/// command runs on the main thread *inside* the WebView2 IPC callback, and
/// building another webview window from there waits on the very thread that is
/// busy dispatching the call — a deadlock that leaves the caller hanging with no
/// window, no error, and a frozen UI. Running on the async runtime lets the
/// builder post its work to the main thread's message queue instead.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    tokio::task::yield_now().await;
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

/// Open an `http(s)` link in the user's default browser.
///
/// The URL is validated first, and the launcher is invoked with an argument
/// vector rather than through a shell. The previous implementation ran
/// `cmd /c start "" <url>`, which re-parses `&` and `"` — so a perfectly ordinary
/// URL carrying a query string (`?a=1&b=2`) would either break or execute the
/// fragment after `&` as a second command.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|e| format!("非法链接: {e}"))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("不允许的链接协议: {scheme}"));
    }
    let url = parsed.to_string();

    #[cfg(target_os = "windows")]
    {
        // `url.dll,FileProtocolHandler` hands the URL to the shell's default
        // handler without involving cmd.exe, so no re-parsing happens.
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }
    Ok(())
}

