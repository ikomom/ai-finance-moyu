//! Configuration, snapshot, layout setting, and data source IPC commands.

use tauri::{AppHandle, Manager};

use crate::config::{self, Config, DataSource, Layout, VisibilityMode};
use crate::market;
use crate::poller;
use crate::state::{AppState, Snapshot};

#[tauri::command]
pub fn get_snapshot(state: tauri::State<AppState>) -> Snapshot {
    state.snapshot()
}

/// Persist a config edited in the settings window. Codes are normalized and
/// out-of-range numbers clamped before anything is written.
#[tauri::command]
pub fn save_config(app: AppHandle, mut cfg: Config) -> Result<(), String> {
    for item in cfg.watchlist.iter_mut() {
        item.code = market::normalize_code(&item.code)?;
    }

    // Preserve live dragged layout sizes from state unless user explicitly reset sizes
    if !cfg.layout_sizes.is_empty() {
        let live_sizes = {
            let state = app.state::<AppState>();
            let sizes = state.config.lock().unwrap().layout_sizes.clone();
            sizes
        };
        cfg.layout_sizes = live_sizes;
    }

    cfg.sanitize();

    // Autostart lives in the OS, not in the file, so a change made in the
    // settings form has to be pushed out to the registry here.
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app.autolaunch();
        let currently = manager.is_enabled().unwrap_or(false);
        if cfg.autostart != currently {
            let result = if cfg.autostart { manager.enable() } else { manager.disable() };
            if let Err(e) = result {
                return Err(format!("设置开机自启失败: {e}"));
            }
        }
    }

    let hotkeys_changed = {
        let state = app.state::<AppState>();
        let current_keys = state.config.lock().unwrap().hotkeys.clone();
        current_keys != cfg.hotkeys
    };

    log::info!(target: "USER", "保存系统配置，自选股共 {} 只", cfg.watchlist.len());
    config::save(&app, &cfg)?;
    {
        let state = app.state::<AppState>();
        *state.config.lock().unwrap() = cfg.clone();
        state.market_fetcher.reset_quota_circuit_breaker();
    }

    if hotkeys_changed {
        crate::window::sync_hotkeys(&app, &cfg.hotkeys);
        log::info!(target: "SYSTEM", "全局热键已动态同步更新");
    }

    if matches!(cfg.visibility_mode, VisibilityMode::Always | VisibilityMode::Hotkey) {
        let _ = crate::window::set_dock_collapsed_inner(&app, false);
    }

    // Re-lay-out and refetch: the watchlist or source may have changed.
    crate::window::apply_layout(&app, cfg.layout);
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = poller::poll_once(&handle).await;
    });
    Ok(())
}

#[tauri::command]
pub fn set_layout(app: AppHandle, layout: Layout) {
    crate::window::apply_layout(&app, layout);
}

#[tauri::command]
pub fn fit_window(app: AppHandle) {
    crate::window::fit_window_now(&app);
}

/// Report the provider list so the settings UI stays in sync with the backend.
#[tauri::command]
pub fn data_sources() -> Vec<(&'static str, &'static str)> {
    vec![
        ("tencent", DataSource::Tencent.label()),
        ("sina", DataSource::Sina.label()),
    ]
}
