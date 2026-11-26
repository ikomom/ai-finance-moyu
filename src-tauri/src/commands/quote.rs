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
    let changed = {
        let mut guard = state.active_trend_targets.lock().unwrap_or_else(|e| e.into_inner());
        let changed = guard.as_ref() != Some(&targets);
        *guard = Some(targets.clone());
        changed && !targets.is_empty()
    };

    if changed {
        // Trigger a background poll to fetch the freshest real-time ticks
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
    let cached = state
        .quotes
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(&norm_code)
        .map(|q| (q.pre_close, q.date.clone()));

    let today_str = market::beijing_now().format("%Y%m%d").to_string();
    let cached_fresh = cached.filter(|(p, d)| *p > 0.0 && (d == &today_str || market::session_at(market::beijing_now()) == market::Session::Closed));

    // 不在自选里的标的没有被轮询，缺昨收或缓存过旧时单独补一次最新报价。
    let (pre_close, quote_date) = match cached_fresh {
        Some((p, d)) => (p, d),
        None => state
            .fetcher
            .fetch_quotes(source, std::slice::from_ref(&norm_code))
            .await
            .ok()
            .and_then(|qs| qs.into_iter().find(|q| q.code == norm_code))
            .map(|q| (q.pre_close, q.date))
            .unwrap_or((0.0, String::new())),
    };

    let mut trend = state
        .fetcher
        .fetch_trend_for_quote(source, &norm_code, pre_close, &quote_date)
        .await
        .map_err(|e| e.to_string())?;
    quote::sanitize_trend_for_quote(&mut trend, &quote_date, pre_close, market::beijing_now());
    Ok(trend)
}

#[tauri::command]
pub async fn get_multi_day_trend(app: AppHandle, code: String) -> Result<quote::MultiDayTrend, String> {
    let state = app.state::<AppState>();
    let norm_code = market::normalize_code(&code)?;
    let result = state
        .fetcher
        .fetch_multi_day_trend(&norm_code)
        .await
        .map_err(|e| e.to_string())?;

    crate::history_trend::archive_days(&app, &norm_code, &result.days);
    Ok(result)
}
