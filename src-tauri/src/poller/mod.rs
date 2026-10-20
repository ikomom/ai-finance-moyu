//! Background polling of quotes and intraday series.
//!
//! Polling is layered because the two endpoints cost very different amounts:
//! the batch quote endpoint answers for the whole watchlist in **one** request,
//! while the intraday endpoint takes one request *per security*. So quotes are
//! polled at a few seconds and trends at a substantially slower cadence.
//!
//! Nothing is requested while the market is closed. A feed whose date is not
//! today means a holiday (or a weekend the clock-based session check can't see),
//! and we drop to a slow re-check instead of hammering the endpoint all day —
//! which also means the app heals itself when trading resumes.

use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::market;
use crate::state::AppState;

mod quotes;

use quotes::poll_quotes;

/// Event carrying a fresh [`crate::state::Snapshot`] to the frontend.
pub const EVENT_SNAPSHOT: &str = "snapshot";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertNotification {
    pub code: String,
    pub name: String,
    pub message: String,
}

/// Re-check cadence when the feed is stale (holiday/weekend). Cheap, but short
/// enough that the first minutes of a new session aren't missed.
const STALE_RECHECK: Duration = Duration::from_secs(20);
/// Re-evaluation cadence while closed. No network happens on these ticks.
const IDLE_TICK: Duration = Duration::from_secs(5);

pub async fn run(app: AppHandle) {
    // Fetch once up front regardless of session, so opening the app on a
    // weekend still shows the last trading day's chart instead of an empty box.
    let _ = poll_quotes(&app).await;
    let _ = poll_trends(&app).await;
    let mut last_trend: Option<Instant> = Some(Instant::now());
    let _ = poll_market_overview(&app).await;
    let mut last_market: Option<Instant> = Some(Instant::now());
    let mut last_session: Option<market::Session> = None;

    loop {
        let (session, poll_ms, trend_ms, feed_is_today, need_retry, is_market, need_market_init) = {
            let state = app.state::<AppState>();
            let now = crate::market::beijing_now();
            let session = market::session_at(now);
            if last_session != Some(session) {
                if let Some(prev) = last_session {
                    log::info!(target: "SESSION", "A股交易时段切换: {:?} -> {:?}", prev, session);
                } else {
                    log::info!(target: "SESSION", "初始识别A股交易时段: {:?}", session);
                }
                last_session = Some(session);
            }
            let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
            let st = state.status.lock().unwrap_or_else(|e| e.into_inner());
            let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
            // A retry may only burn requests while the market can actually
            // produce new data; see `Session::allows_retry`.
            let need_retry = (quotes.is_empty() || st.error.is_some()) && session.allows_retry();
            let is_market = cfg.layout == crate::config::Layout::Market
                || cfg.layout == crate::config::Layout::Global;
            let need_market_init = state.market_overview.lock().unwrap_or_else(|e| e.into_inner()).is_none();
            (session, cfg.poll_quotes_ms, cfg.poll_trend_ms, st.trading_today, need_retry, is_market, need_market_init)
        };

        let market_interval = if is_market {
            Duration::from_secs(5)
        } else {
            Duration::from_secs(20)
        };
        let market_due = need_market_init
            || ((session.is_live() || need_retry)
                && last_market.is_none_or(|t| t.elapsed() >= market_interval));
        if market_due {
            let _ = poll_market_overview(&app).await;
            last_market = Some(Instant::now());
        }

        if session.is_live() || need_retry {
            let _ = poll_quotes(&app).await;

            let due = last_trend
                .is_none_or(|t| t.elapsed() >= Duration::from_millis(trend_ms));
            if due || need_retry {
                let _ = poll_trends(&app).await;
                last_trend = Some(Instant::now());
            }
        }

        let wait = if need_retry {
            Duration::from_secs(10)
        } else if !session.is_live() {
            IDLE_TICK
        } else if feed_is_today {
            Duration::from_millis(poll_ms)
        } else {
            STALE_RECHECK
        };
        tokio::time::sleep(wait).await;
    }
}

/// Fetch everything once, on demand — used by the tray's 立即刷新 and by the
/// frontend after the user edits the watchlist.
pub async fn poll_once(app: &AppHandle) -> Result<(), String> {
    let _ = poll_market_overview(app).await;
    poll_quotes(app).await?;
    poll_trends(app).await
}

/// Fetch real-time market panorama & breadth data when in Market layout.
pub async fn poll_market_overview(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let api_key = state.config.lock().unwrap_or_else(|e| e.into_inner()).iwencai_api_key.clone();
    match state.market_fetcher.fetch_overview(api_key.as_deref()).await {
        Ok(overview) => {
            *state.market_overview.lock().unwrap_or_else(|e| e.into_inner()) = Some(overview);
            emit_snapshot(app);
            Ok(())
        }
        Err(e) => {
            log::warn!(target: "NET", "拉取大盘全景数据失败: {e}");
            Err(e)
        }
    }
}

/// Push the current state to the webview.
pub fn emit_snapshot(app: &AppHandle) {
    let snapshot = {
        let state = app.state::<AppState>();
        state.snapshot()
    };
    let _ = app.emit(EVENT_SNAPSHOT, snapshot);
}

mod status;
mod trends;

pub use trends::poll_trends;
