//! Window operations, context menu, docking, and URL opening IPC commands.

use tauri::{AppHandle, Manager};

use crate::config::VisibilityMode;
use crate::window::{apply_visibility_mode, open_settings, set_dock_collapsed_inner, DISPLAY};

/// Open the settings window from the frontend.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    tokio::task::yield_now().await;
    open_settings(&app)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    let _ = crate::commands::ai_decision::process::stop_service();
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

/// 主挂件常态不可聚焦（`focusable: false`），鼠标划过不会抢走用户正在别处打字的键盘焦点。
/// 但代价是任何输入框都收不到按键 —— 所以用户点进输入框时临时打开，离开后关回去。
#[tauri::command]
pub async fn set_widget_focusable(app: AppHandle, focusable: bool) -> Result<(), String> {
    let Some(win) = app.get_webview_window(DISPLAY) else {
        return Ok(());
    };
    win.set_focusable(focusable).map_err(|e| e.to_string())?;

    if focusable {
        // `set_focusable` 只是往事件循环投递一条窗口消息，样式生效前抢前台会被系统拒绝。
        tokio::time::sleep(std::time::Duration::from_millis(16)).await;
        crate::window::force_foreground(&win);
        let _ = win.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub fn show_context_menu(app: AppHandle, code: Option<String>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(DISPLAY) {
        crate::window::show_context_menu(&app, &win, code.as_deref()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open an `http(s)` link in the user's default browser.
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
