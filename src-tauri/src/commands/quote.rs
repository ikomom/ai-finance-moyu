//! Quote querying, search, trend targets, and KLine retrieval IPC commands.

use tauri::{AppHandle, Manager};

use crate::market;
use crate::poller;
use crate::quote;
use crate::search;
use crate::state::AppState;

#[tauri::command]
pub async fn refresh_now(app: AppHandle) -> Result<(), String> {
    poller::poll_once(&app).await
}

#[tauri::command]
pub async fn search_securities(
    state: tauri::State<'_, AppState>,
    query: String,
) -> Result<Vec<search::SearchResult>, String> {
    state.search.search(&query).await
}

#[tauri::command]
pub async fn set_trend_targets(app: AppHandle, targets: Vec<String>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (changed, has_cached) = {
        let mut guard = state.active_trend_targets.lock().unwrap_or_else(|e| e.into_inner());
        let changed = guard.as_ref() != Some(&targets);
        *guard = Some(targets.clone());
        if changed && !targets.is_empty() {
            let trends = state.trends.lock().unwrap_or_else(|e| e.into_inner());
            let has_cached = targets.iter().all(|c| trends.contains_key(c));
            (true, has_cached)
        } else {
            (false, false)
        }
    };

    if changed {
        // If we already have cached trend points in memory, push snapshot immediately
        // so the frontend renders with 0ms blank-screen delay
        if has_cached {
            poller::emit_snapshot(&app);
        }
        // Always trigger an immediate background poll to fetch the freshest real-time ticks
        tauri::async_runtime::spawn(async move {
            let _ = poller::poll_trends(&app).await;
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn get_kline(
    app: AppHandle,
    code: String,
    period: Option<String>,
) -> Result<quote::KLineData, String> {
    let state = app.state::<AppState>();
    let norm_code = market::normalize_code(&code)?;
    state.fetcher.fetch_kline(&norm_code, period.as_deref()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_global_kline(
    app: AppHandle,
    code: String,
    period: Option<String>,
) -> Result<quote::KLineData, String> {
    let state = app.state::<AppState>();
    state
        .fetcher
        .fetch_global_kline(&code, period.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_global_trend(app: AppHandle, code: String) -> Result<quote::Trend, String> {
    let state = app.state::<AppState>();
    state.fetcher.fetch_global_trend(&code).await.map_err(|e| e.to_string())
}

/// Intraday series for one A-share code, fetched on demand.
///
/// Serves the dragon-tiger drill-down, where the target is usually *not* in the
/// watchlist and therefore has no polled quote or cached trend behind it.
#[tauri::command]
pub async fn get_stock_trend(app: AppHandle, code: String) -> Result<quote::Trend, String> {
    let state = app.state::<AppState>();
    let norm_code = market::normalize_code(&code)?;

    // 两次加锁各自独立取值，不嵌套，避免与 poller 的锁序相冲。
    let source = state.config.lock().unwrap_or_else(|e| e.into_inner()).data_source;
    let cached_pre_close = state
        .quotes
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&norm_code)
        .map(|q| q.pre_close);

    // 不在自选里的标的没有被轮询，缺昨收就没有基准线，单独补一次报价。
    let pre_close = match cached_pre_close {
        Some(p) if p > 0.0 => p,
        _ => state
            .fetcher
            .fetch_quotes(source, std::slice::from_ref(&norm_code))
            .await
            .ok()
            .and_then(|qs| qs.into_iter().find(|q| q.code == norm_code))
            .map(|q| q.pre_close)
            .unwrap_or(0.0),
    };

    state
        .fetcher
        .fetch_trend(source, &norm_code, pre_close)
        .await
        .map_err(|e| e.to_string())
}
