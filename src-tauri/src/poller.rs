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

use chrono::Local;
use tauri::{AppHandle, Emitter, Manager};

use crate::market;
use crate::quote::Quote;
use crate::state::{AppState, PollStatus};

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
            let now = Local::now().naive_local();
            let session = market::session_at(now);
            if last_session != Some(session) {
                if let Some(prev) = last_session {
                    log::info!(target: "SESSION", "A股交易时段切换: {:?} -> {:?}", prev, session);
                } else {
                    log::info!(target: "SESSION", "初始识别A股交易时段: {:?}", session);
                }
                last_session = Some(session);
            }
            let cfg = state.config.lock().unwrap();
            let st = state.status.lock().unwrap();
            let quotes = state.quotes.lock().unwrap();
            let need_retry = quotes.is_empty() || st.error.is_some();
            let is_market = cfg.layout == crate::config::Layout::Market;
            let need_market_init = state.market_overview.lock().unwrap().is_none();
            (session, cfg.poll_quotes_ms, cfg.poll_trend_ms, st.trading_today, need_retry, is_market, need_market_init)
        };

        let market_interval = if is_market {
            Duration::from_secs(5)
        } else {
            Duration::from_secs(20)
        };
        let market_due = need_market_init
            || ((session.is_live() || need_retry)
                && last_market.map_or(true, |t| t.elapsed() >= market_interval));
        if market_due {
            let _ = poll_market_overview(&app).await;
            last_market = Some(Instant::now());
        }

        if session.is_live() || need_retry {
            let _ = poll_quotes(&app).await;

            let due = last_trend
                .map_or(true, |t| t.elapsed() >= Duration::from_millis(trend_ms));
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
    let api_key = state.config.lock().unwrap().iwencai_api_key.clone();
    match state.market_fetcher.fetch_overview(api_key.as_deref()).await {
        Ok(overview) => {
            *state.market_overview.lock().unwrap() = Some(overview);
            emit_snapshot(app);
            Ok(())
        }
        Err(e) => {
            log::warn!(target: "NET", "拉取大盘全景数据失败: {e}");
            Err(e)
        }
    }
}

/// One batch request for every code on the watchlist.
async fn poll_quotes(app: &AppHandle) -> Result<(), String> {
    let (codes, source) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap();
        (cfg.codes(), cfg.data_source)
    };
    if codes.is_empty() {
        return Ok(());
    }

    let fetched = {
        let state = app.state::<AppState>();
        state.fetcher.fetch_quotes(source, &codes).await
    };

    let quotes = match fetched {
        Ok(q) => q,
        Err(e) => {
            record_error(app, &e.labelled());
            return Err(e.labelled());
        }
    };

    let (notifications, trend_engine_enabled) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap();

        let now = chrono::Local::now().naive_local();
        let session = crate::market::session_at(now);
        let in_auction_or_pretrade = session.is_morning_auction() || session == crate::market::Session::PreTrade;

        // Evaluate crossings against the *previous* tick before we replace the
        // stored quotes, otherwise every poll would look like a fresh seed.
        let mut tracker = state.tracker.lock().unwrap();
        let mut events = Vec::new();

        // During 09:15-09:30 call auction and pre-trade silence:
        // Do not evaluate anomaly triggers (rapid_change, intraday_extremes, etc.)
        // to prevent false alarms caused by virtual matching orders and cancellations.
        let empty_anomalies = crate::config::AnomalyAlertConfig {
            rapid_change: false,
            intraday_extremes: false,
            volume_burst: false,
            limit_board: false,
        };
        let anomaly_cfg = if in_auction_or_pretrade {
            &empty_anomalies
        } else {
            &cfg.anomaly_alerts
        };

        for q in &quotes {
            if let Some(item) = cfg.watchlist.iter().find(|w| w.code == q.code) {
                events.extend(tracker.update_quote(
                    &item.spec(cfg.alert_pct),
                    q,
                    anomaly_cfg,
                ));
            }
        }

        // Forget securities the user removed so they re-arm if re-added.
        tracker.retain(&codes);

        let names: std::collections::HashMap<&str, &str> =
            quotes.iter().map(|q| (q.code.as_str(), q.name.as_str())).collect();

        // Silence all notifications (desktop OS and in-app toasts) during call auction and pre-trade
        let notifications: Vec<AlertNotification> = if in_auction_or_pretrade {
            Vec::new()
        } else {
            events
                .iter()
                .map(|ev| {
                    let name = names.get(ev.code()).copied().unwrap_or(ev.code());
                    AlertNotification {
                        code: ev.code().to_string(),
                        name: name.to_string(),
                        message: ev.message(name),
                    }
                })
                .collect()
        };

        if !notifications.is_empty() {
            for notif in &notifications {
                log::info!(target: "ALERT", "[盘中异动] {} ({}): {}", notif.name, notif.code, notif.message);
                if cfg.notifications {
                    spawn_system_notification(app, notif);
                }
            }
        }

        let mut store = state.quotes.lock().unwrap();
        for q in quotes.iter() {
            store.insert(q.code.clone(), q.clone());
        }

        let cache = crate::config::QuotesCache {
            quotes: store.values().cloned().collect(),
            trends: state.trends.lock().unwrap().clone(),
        };
        crate::config::save_cache(app, &cache);

        (notifications, cfg.trend_engine)
    };

    // Let the widget flash its border and show in-app toast on crossing.
    if !notifications.is_empty() {
        let _ = app.emit("alert", &notifications);
    }

    {
        let state = app.state::<AppState>();
        update_trend_signals(&state, trend_engine_enabled);

        let now = chrono::Local::now().naive_local();
        let session = crate::market::session_at(now);
        let mut auction_tracker = state.auction_tracker.lock().unwrap_or_else(|e| e.into_inner());
        if session.is_morning_auction() || session == crate::market::Session::PreTrade {
            for q in &quotes {
                let prev_tag = auction_tracker.data.get(&q.code).and_then(|d| d.diagnosis.as_ref()).map(|d| d.tag);
                auction_tracker.update_quote(session, q);
                let new_diag = auction_tracker.data.get(&q.code).and_then(|d| d.diagnosis.as_ref()).cloned();
                if let Some(diag) = new_diag {
                    if prev_tag != Some(diag.tag) && diag.tag != crate::auction_engine::AuctionTag::Normal {
                        log::warn!(
                            target: "AUCTION",
                            "[集合竞价诊断] {} ({}): {} - {} (开盘试盘: {:.2}%)",
                            q.name,
                            q.code,
                            diag.label,
                            diag.detail,
                            q.change_pct
                        );
                    }
                }
            }
        } else {
            for q in &quotes {
                auction_tracker.ensure_cold_start_entry(q);
            }
        }
    }

    record_success(app, &quotes);
    emit_snapshot(app);
    Ok(())
}

/// One request per security. Errors on an individual code don't abort the rest.
///
/// Implements on-demand loading and a bounded concurrency throttle pool:
/// - Only polls active trend targets requested by the current layout:
///   - Mini layout: only the single selected stock
///   - List layout: rows in visible viewport + buffer rows
///   - Bar layout: none (empty targets)
/// - Uses a concurrency throttle pool (max 3 concurrent requests) instead of sequential
///   blocking or unbounded flooding, preventing CDN rate limits and high latency.
pub async fn poll_trends(app: &AppHandle) -> Result<(), String> {
    let (codes, source) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap();
        let targets = state.active_trend_targets.lock().unwrap().clone();
        let watchlist_codes = cfg.codes();
        let final_codes = match targets {
            Some(t) => {
                let set: std::collections::HashSet<_> = watchlist_codes.into_iter().collect();
                t.into_iter().filter(|c| set.contains(c)).collect::<Vec<_>>()
            }
            None => {
                match cfg.layout {
                    crate::config::Layout::Bar | crate::config::Layout::Market => Vec::new(),
                    crate::config::Layout::Mini => {
                        watchlist_codes.into_iter().take(1).collect()
                    }
                    crate::config::Layout::List => {
                        watchlist_codes.into_iter().take(12).collect()
                    }
                }
            }
        };
        (final_codes, cfg.data_source)
    };

    if codes.is_empty() {
        return Ok(());
    }

    const MAX_CONCURRENT_TREND_FETCHES: usize = 3;
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT_TREND_FETCHES));
    let mut handles = Vec::with_capacity(codes.len());

    for code in codes {
        let sem = semaphore.clone();
        let app_handle = app.clone();
        let code_clone = code.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await;
            let pre_close = {
                let state = app_handle.state::<AppState>();
                let quotes = state.quotes.lock().unwrap();
                quotes.get(&code_clone).map(|q| q.pre_close).unwrap_or(0.0)
            };
            let state = app_handle.state::<AppState>();
            let fetched = state.fetcher.fetch_trend(source, &code_clone, pre_close).await;
            (code_clone, fetched)
        }));
    }

    for handle in handles {
        match handle.await {
            Ok((code, Ok(trend))) => {
                let state = app.state::<AppState>();
                state.trends.lock().unwrap().insert(code, trend);
            }
            Ok((code, Err(e))) => {
                log::warn!(target: "NET", "分时拉取失败 {code}: {e}");
            }
            Err(e) => {
                log::error!(target: "SYSTEM", "分时拉取任务异常: {e}");
            }
        }
    }

    {
        let state = app.state::<AppState>();
        let quotes: Vec<Quote> = state.quotes.lock().unwrap().values().cloned().collect();
        let trends = state.trends.lock().unwrap().clone();
        let cache = crate::config::QuotesCache { quotes, trends };
        crate::config::save_cache(app, &cache);

        let enabled = state.config.lock().unwrap().trend_engine;
        update_trend_signals(&state, enabled);
    }

    emit_snapshot(app);
    Ok(())
}

fn update_trend_signals(state: &AppState, enabled: bool) {
    if !enabled {
        state.trend_signals.lock().unwrap().clear();
        return;
    }

    let quotes = state.quotes.lock().unwrap();
    let trends = state.trends.lock().unwrap();
    let overview_guard = state.market_overview.lock().unwrap();
    let mut signals = state.trend_signals.lock().unwrap();

    let (market_pct, sectors) = match overview_guard.as_ref() {
        Some(ov) => {
            let m_pct = ov
                .indices
                .iter()
                .find(|idx| idx.code == "000001" || idx.code == "sh000001")
                .map(|idx| idx.change_pct)
                .unwrap_or(0.0);
            (m_pct, ov.top_sectors.as_slice())
        }
        None => (0.0, [].as_slice()),
    };

    for (code, q) in quotes.iter() {
        let t = trends.get(code);
        let linkage = if crate::market::is_index(&q.code) {
            None
        } else {
            crate::market_overview::match_stock_sector(
                &q.code,
                &q.name,
                q.change_pct,
                sectors,
                market_pct,
            )
        };
        if let Some(sig) = crate::trend_engine::analyze_trend(q, t, linkage) {
            signals.insert(code.clone(), sig);
        }
    }
}

fn record_success(app: &AppHandle, quotes: &[Quote]) {
    let today = Local::now().format("%Y%m%d").to_string();
    let feed_date = quotes.iter().find_map(|q| {
        if q.date.is_empty() { None } else { Some(q.date.clone()) }
    });
    let trading_today = feed_date.as_deref() == Some(today.as_str());

    let state = app.state::<AppState>();
    let mut st = state.status.lock().unwrap();
    st.last_update = Some(Local::now().format("%H:%M:%S").to_string());
    st.error = None;
    st.trading_today = trading_today;
    st.session = format!("{:?}", market::session_at(Local::now().naive_local()));
    if feed_date.is_some() {
        st.feed_date = feed_date;
    }
}

fn record_error(app: &AppHandle, message: &str) {
    let state = app.state::<AppState>();
    let mut st: std::sync::MutexGuard<'_, PollStatus> = state.status.lock().unwrap();
    st.error = Some(message.to_string());
    st.session = format!("{:?}", market::session_at(Local::now().naive_local()));
}

/// Push the current state to the webview.
pub fn emit_snapshot(app: &AppHandle) {
    let snapshot = {
        let state = app.state::<AppState>();
        state.snapshot()
    };
    let _ = app.emit(EVENT_SNAPSHOT, snapshot);
}

fn spawn_system_notification(app: &AppHandle, notif: &AlertNotification) {
    let mut n = notify_rust::Notification::new();
    n.summary("股市异动");
    n.body(&notif.message);
    n.auto_icon();

    #[cfg(windows)]
    {
        if let Ok(exe) = tauri::utils::platform::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let curr_dir = exe_dir.display().to_string();
                let sep = std::path::MAIN_SEPARATOR;
                if !(curr_dir.ends_with(&format!("{sep}target{sep}debug"))
                    || curr_dir.ends_with(&format!("{sep}target{sep}release")))
                {
                    n.app_id("com.moyu.finance");
                }
            }
        }
    }

    let code = notif.code.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(handle) = n.show() {
            let _ = handle.wait_for_response(move |resp: &notify_rust::NotificationResponse| {
                if resp.is_default_action() || matches!(resp, notify_rust::NotificationResponse::Action(_)) {
                    crate::navigate_to_stock_mini(&app_handle, &code);
                }
            });
        }
    });
}

