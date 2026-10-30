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
