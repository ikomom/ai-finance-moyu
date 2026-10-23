//! Configuration, snapshot, layout setting, and data source IPC commands.

use tauri::{AppHandle, Manager};

use crate::config::{self, Config, DataSource, Layout, VisibilityMode};
use crate::market;
use crate::poller;
use crate::state::{AppState, Snapshot};

/// The subset of the previous in-memory config that `save_config` needs in order
/// to merge omitted fields instead of wiping them.
struct PreviousConfig {
    iwencai_api_key: Option<String>,
    layout_sizes: crate::config::LayoutSizes,
    ai_decision_online_api_key: Option<String>,
}

/// Hand the renderer a consistent view of everything it displays.
///
/// Every lock taken here is also taken by the poller, so this call is where lock
/// contention would surface as a slow window. It is measured and reported only
/// when it is actually slow, so a healthy call stays silent but a regression
/// leaves a trace in the log.
#[tauri::command]
pub fn get_snapshot(state: tauri::State<AppState>) -> Snapshot {
    let started = std::time::Instant::now();
    let snapshot = state.snapshot();
    let elapsed_ms = started.elapsed().as_millis();
    if elapsed_ms >= 200 {
        log::warn!(target: "SYSTEM", "配置快照耗时 {elapsed_ms}ms（锁竞争）");
    }
    snapshot
}

/// Persist a config edited in the settings window. Codes are normalized and
/// out-of-range numbers clamped before anything is written.
///
/// `iwencai_api_key` uses a three-way protocol because the secret is never sent
/// to the webview and therefore cannot be echoed back:
///   * field absent (`None`)      → keep whatever is already stored;
///   * empty string (`Some("")`)  → the user deliberately cleared it;
///   * non-empty                  → replace the stored key.
#[tauri::command]
pub fn save_config(app: AppHandle, mut cfg: Config) -> Result<(), String> {
    for item in cfg.watchlist.iter_mut() {
        item.code = market::normalize_code(&item.code)?;
    }

    let previous = {
        let state = app.state::<AppState>();
        let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        PreviousConfig {
            iwencai_api_key: guard.iwencai_api_key.clone(),
            layout_sizes: guard.layout_sizes.clone(),
            ai_decision_online_api_key: guard.ai_decision.online_api_key.clone(),
        }
    };

    if let Some(ref key) = cfg.ai_decision.online_api_key {
        if key.trim().is_empty() {
            cfg.ai_decision.online_api_key = previous.ai_decision_online_api_key;
        }
    } else {
        cfg.ai_decision.online_api_key = previous.ai_decision_online_api_key;
    }

    match cfg.iwencai_api_key.as_deref() {
        None => cfg.iwencai_api_key = previous.iwencai_api_key.clone(),
        Some(key) if key.trim().is_empty() => cfg.iwencai_api_key = None,
        _ => {}
    }

    let key_changed = cfg
        .iwencai_api_key
        .as_deref()
        .map(str::trim)
        .unwrap_or_default()
        != previous
            .iwencai_api_key
            .as_deref()
            .map(str::trim)
            .unwrap_or_default();

    // Preserve live dragged layout sizes from state unless user explicitly reset sizes
    if !cfg.layout_sizes.is_empty() {
        cfg.layout_sizes = previous.layout_sizes;
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
        let current_keys = state.config.lock().unwrap_or_else(|e| e.into_inner()).hotkeys.clone();
        current_keys != cfg.hotkeys
    };

    let layout_changed = {
        let state = app.state::<AppState>();
        let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        guard.layout != cfg.layout
    };

    log::info!(target: "USER", "保存系统配置，自选股共 {} 只", cfg.watchlist.len());
    config::save(&app, &cfg)?;
    {
        let state = app.state::<AppState>();
        *state.config.lock().unwrap_or_else(|e| e.into_inner()) = cfg.clone();
        // Only an explicit credential change may re-arm a tripped quota breaker.
        // Unconditionally clearing it (the old behaviour) meant tweaking the
        // opacity re-armed a breaker the provider had already answered with 401.
        if key_changed {
            state.market_fetcher.reset_quota_circuit_breaker();
            log::info!(target: "USER", "问财 API Key 已更新，配额熔断已重置");
        }
    }

    if hotkeys_changed {
        crate::window::sync_hotkeys(&app, &cfg.hotkeys);
        log::info!(target: "SYSTEM", "全局热键已动态同步更新");
    }

    if matches!(cfg.visibility_mode, VisibilityMode::Always | VisibilityMode::Hotkey) {
        let _ = crate::window::set_dock_collapsed_inner(&app, false);
    }

    // Re-lay-out and refetch: the watchlist or source may have changed.
    if layout_changed {
        crate::window::apply_layout(&app, cfg.layout);
    } else {
        crate::window::fit_window_now(&app);
    }
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
