//! Window visibility transitions, layout switching, settings window creation, and autostart toggling.

use std::sync::Mutex;
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
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
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
        let l = state.config.lock().unwrap_or_else(|e| e.into_inner()).layout;
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
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
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
            let c = state.dock_state.lock().unwrap_or_else(|e| e.into_inner()).collapsed;
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

static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

/// Open the settings window, creating it on first use.
pub fn open_settings(app: &AppHandle) -> Result<(), String> {
    let _guard = SETTINGS_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(win) = app.get_webview_window(SETTINGS) {
        reveal_secondary(&win, "#settings-root");
        return Ok(());
    }
    log::info!(target: "USER", "打开设置窗口");

    let win = tauri::WebviewWindowBuilder::new(
        app,
        SETTINGS,
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("设置 · A股摸鱼")
    .inner_size(840.0, 680.0)
    .min_inner_size(680.0, 480.0)
    .center()
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(false)
    .skip_taskbar(false)
    .focused(true)
    .build()
    .map_err(|e| format!("打开设置窗口失败: {e}"))?;

    watch_new_window(win.clone(), "#settings-root");
    let _ = win.set_focus();
    Ok(())
}

/// Ask a window to reload itself if its document never rendered.
///
/// A secondary window is created once and then only ever `show()`n again. If the
/// very first navigation failed — the dev server was not up yet, or WebView2's
/// renderer died while the machine slept — the window stays a blank white
/// rectangle forever, because nothing ever retries the load. Running this check
/// on every reuse makes the window self-healing without disturbing a healthy one
/// (a loaded page satisfies the selector and the script does nothing).
fn reload_if_blank(win: &tauri::WebviewWindow, ready_selector: &str) {
    // `ready_selector` is a compile-time constant defined in this module, so
    // interpolating it into the script cannot inject anything.
    //
    // The log line fires only on the broken path, so a healthy window stays
    // silent while a white one leaves a trace in `app.log` for later diagnosis.
    // Before reloading, the entry module is re-fetched so the log records *why*
    // the page came up empty (a 404/500 here means the module never executed).
    let script = format!(
        "if (!document.querySelector({sel:?})) {{ try {{ \
           var s = document.querySelector('script[type=module]'); \
           var u = s ? s.src : ''; \
           var r = document.getElementById('root'); \
           var b = document.getElementById('boot-err'); \
           fetch(u).then(function(res) {{ window.__TAURI_INTERNALS__.invoke('frontend_log', {{ msg: '窗口空白 ready=' + document.readyState + ' rootKids=' + (r ? r.children.length : 'no-root') + ' entry=' + u + ' status=' + res.status + ' bootErr=' + (b ? b.textContent.slice(0, 200) : 'none') }}).catch(function(){{}}); }}).catch(function(e) {{ window.__TAURI_INTERNALS__.invoke('frontend_log', {{ msg: '窗口空白 入口请求失败 ' + e }}).catch(function(){{}}); }}); \
         }} catch (e) {{}} location.reload(); }}",
        sel = ready_selector
    );

    // The first `eval` can be dropped while the window is still being raised to
    // the foreground, which is exactly the moment this runs. A second, delayed
    // attempt makes the check reliable and stays a no-op once the page is up
    // (the reloaded document satisfies the selector).
    if let Err(e) = win.eval(&script) {
        log::warn!(target: "SYSTEM", "窗口自检脚本执行失败: {e}");
    }
    let retry_win = win.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        let _ = retry_win.eval(&script);
    });
}

/// Bring an existing secondary window back, healing a window that never loaded.
fn reveal_secondary(win: &tauri::WebviewWindow, ready_selector: &str) {
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
    reload_if_blank(win, ready_selector);
}

/// How many automatic reloads the process may spend healing windows.
///
/// Each reload re-enters this path, so without a cap a page that genuinely
/// cannot render (a broken build) would reload forever.
static AUTO_HEAL_BUDGET: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(3);

/// Give a freshly created window one chance to heal itself.
///
/// Creation normally paints immediately, but WebView2 occasionally finishes the
/// navigation and then never composites — the window stays pure white while the
/// DOM behind it is fine. The reuse path cannot help there (nobody reopens the
/// window), so a delayed check runs once after creation.
fn watch_new_window(win: tauri::WebviewWindow, ready_selector: &'static str) {
    use std::sync::atomic::Ordering;
    let mut budget = AUTO_HEAL_BUDGET.load(Ordering::SeqCst);
    loop {
        if budget == 0 {
            return;
        }
        match AUTO_HEAL_BUDGET.compare_exchange_weak(
            budget,
            budget - 1,
            Ordering::SeqCst,
            Ordering::SeqCst,
        ) {
            Ok(_) => break,
            Err(actual) => budget = actual,
        }
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1200)).await;
        reload_if_blank(&win, ready_selector);
    });
}


/// Flip the autostart registration and mirror it into the config file.
///
/// The OS registration is the source of truth: the config file is a cache of it,
/// not a second opinion. Reading the flag back from disk (the old behaviour)
/// let the tray and the settings form disagree, and the next save silently
/// reverted whichever one lost.
pub fn toggle_autostart(app: &AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    let manager = app.autolaunch();
    let currently = manager.is_enabled().unwrap_or(false);
    let next = !currently;
    if next {
        manager.enable().map_err(|e| format!("开启自启失败: {e}"))?;
    } else {
        manager.disable().map_err(|e| format!("关闭自启失败: {e}"))?;
    }

    let cfg = {
        let state = app.state::<AppState>();
        let mut guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        guard.autostart = next;
        guard.clone()
    };
    config::save(app, &cfg)?;
    poller::emit_snapshot(app);
    Ok(next)
}
