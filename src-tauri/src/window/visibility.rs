//! Window visibility transitions, layout switching, settings window creation, and autostart toggling.

use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::config::{self, Layout, VisibilityMode};
use crate::poller;
use crate::state::AppState;
use super::dock::set_dock_collapsed_inner;
use super::geometry::{place_window, suppress_resize, DISPLAY, SETTINGS};

/// Switch layout: persist it, resize the window, tell the frontend.
pub fn apply_layout(app: &AppHandle, layout: Layout) {
    let (rows, snapshot) = {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        cfg.layout = layout;
        (cfg.watchlist.len(), cfg.clone())
    };
    log::info!(target: "USER", "切换布局模式至 {:?}", layout);
    let _ = config::save(app, &snapshot);

    // 1. Uncollapse dock with the NEW layout dimensions
    let _ = set_dock_collapsed_inner(app, false);

    // 2. If the window was hidden (e.g. by boss key) or minimized, reveal and show it immediately!
    if let Some(win) = app.get_webview_window(DISPLAY) {
        let _ = win.unminimize();
        let _ = win.show();
    }

    if layout == Layout::Market || layout == Layout::Global {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = poller::poll_market_overview(&handle).await;
        });
    } else if layout == Layout::Mini {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = poller::poll_trends(&handle).await;
        });
    }

    // The programmatic resize below would otherwise be recorded as a user-chosen
    // size, pinning a layout that should keep auto-sizing.
    suppress_resize(app, Duration::from_millis(700));

    // Re-clamp rather than only resizing: the list layout is much taller than the
    // bar layout, so growing it near the bottom edge would push it off-screen.
    place_window(app, layout, rows);

    poller::emit_snapshot(app);
}

/// Navigate to a specific stock in Mini layout (e.g. from notification click).
/// Uncollapses the dock, switches layout to Mini if not already in Mini, reveals and focuses the window,
/// and emits `navigate_stock` event to frontend.
pub fn navigate_to_stock_mini(app: &AppHandle, code: &str) {
    let _ = set_dock_collapsed_inner(app, false);

    let current_layout = {
        let state = app.state::<AppState>();
        let l = state.config.lock().unwrap().layout;
        l
    };
    if current_layout != Layout::Mini {
        apply_layout(app, Layout::Mini);
    }

    if let Some(win) = app.get_webview_window(DISPLAY) {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }

    let _ = app.emit("navigate_stock", serde_json::json!({
        "code": code,
        "mode": "trend"
    }));
}

pub fn apply_visibility_mode(app: &AppHandle, mode: VisibilityMode) -> Result<(), String> {
    let cfg = {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        cfg.visibility_mode = mode;
        cfg.clone()
    };
    config::save(app, &cfg)?;
    if matches!(mode, VisibilityMode::Always | VisibilityMode::Hotkey) {
        let _ = set_dock_collapsed_inner(app, false);
    }
    poller::emit_snapshot(app);
    Ok(())
}

/// The 老板键 / 托盘图标唤出 action.
pub fn toggle_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(DISPLAY) {
        let is_visible = win.is_visible().unwrap_or(false);
        let is_collapsed = {
            let state = app.state::<AppState>();
            let c = state.dock_state.lock().unwrap().collapsed;
            c
        };

        if is_visible && !is_collapsed {
            // 窗口当前可见且处于完全展开状态 -> 老板键执行彻底隐藏
            let _ = win.hide();
        } else {
            // 窗口处于隐藏状态或当前已贴边折叠 -> 强制展开并显示
            let _ = set_dock_collapsed_inner(app, false);
            let _ = win.show();
        }
    }
}

/// Open the settings window, creating it on first use.
///
/// Deliberately a real decorated window: it needs focus for its inputs, it wants
/// a native close button, and it should appear in the taskbar so it can be found
/// again. The display widget is the opposite of all three.
pub fn open_settings(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(SETTINGS) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
        return Ok(());
    }

    let win = tauri::WebviewWindowBuilder::new(
        app,
        SETTINGS,
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("设置 · A股摸鱼")
    .inner_size(760.0, 620.0)
    .min_inner_size(680.0, 480.0)
    .center()
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(true)
    .skip_taskbar(false)
    .focused(true)
    .build()
    .map_err(|e| format!("打开设置窗口失败: {e}"))?;

    let _ = win.set_focus();
    Ok(())
}

/// Flip the autostart registration and mirror it into the config file.
pub fn toggle_autostart(app: &AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    let mut cfg = config::load(app);
    let next = !cfg.autostart;
    let manager = app.autolaunch();
    if next {
        manager.enable().map_err(|e| format!("开启自启失败: {e}"))?;
    } else {
        manager.disable().map_err(|e| format!("关闭自启失败: {e}"))?;
    }
    cfg.autostart = next;
    config::save(app, &cfg)?;
    Ok(next)
}
