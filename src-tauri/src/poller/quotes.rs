//! Batch quote polling for the whole watchlist.
//!
//! Split from `poller.rs` to stay inside the 300-line budget (AGENTS.md §11).


use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

use super::status::{record_error, record_success, spawn_system_notification};
use super::trends::update_trend_signals;
use super::{emit_snapshot, AlertNotification};

pub(super) async fn poll_quotes(app: &AppHandle) -> Result<(), String> {
    let (codes, watchlist_codes, source) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        let portfolio = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        let watchlist_codes = cfg.codes();
        let mut all_codes = watchlist_codes.clone();
        for pos in &portfolio.positions {
            if !all_codes.contains(&pos.code) {
                all_codes.push(pos.code.clone());
            }
        }
        for ord in &portfolio.pending_orders {
            if !all_codes.contains(&ord.code) {
                all_codes.push(ord.code.clone());
            }
        }
        (all_codes, watchlist_codes, cfg.data_source)
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

    let (notifications, trend_engine_enabled, cache) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());

        let now = crate::market::beijing_now();
        let session = crate::market::session_at(now);
        let in_auction_or_pretrade = session.is_call_auction() || session == crate::market::Session::PreTrade;

        // Evaluate crossings against the *previous* tick before we replace the
        // stored quotes, otherwise every poll would look like a fresh seed.
        let mut tracker = state.tracker.lock().unwrap_or_else(|e| e.into_inner());
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
        tracker.retain(&watchlist_codes);

        let names: std::collections::HashMap<&str, &str> =
            quotes.iter().map(|q| (q.code.as_str(), q.name.as_str())).collect();

        // Silence all notifications (desktop OS and in-app toasts) during call auction and pre-trade
        let notifications: Vec<AlertNotification> = if in_auction_or_pretrade {
            Vec::new()
        } else {
            let mut grouped_events: Vec<(&str, Vec<&crate::crossing::CrossingEvent>)> = Vec::new();
            for ev in &events {
                if let Some((_, list)) = grouped_events.iter_mut().find(|(c, _)| *c == ev.code()) {
                    list.push(ev);
                } else {
                    grouped_events.push((ev.code(), vec![ev]));
                }
            }

            grouped_events
                .into_iter()
                .map(|(code, code_events)| {
                    let name = names.get(code).copied().unwrap_or(code);
                    let message = if code_events.len() == 1 {
                        code_events[0].message(name)
                    } else {
                        let latest_price = code_events.iter().find_map(|e| e.price());
                        let badges: Vec<String> = code_events.iter().map(|e| e.badge()).collect();
                        match latest_price {
                            Some(p) => format!("{name} 现价 {p:.2} | {}", badges.join(" · ")),
                            None => format!("{name} | {}", badges.join(" · ")),
                        }
                    };
                    AlertNotification {
                        code: code.to_string(),
                        name: name.to_string(),
                        message,
                    }
                })
                .collect()
        };

        if !notifications.is_empty() {
            let now_instant = std::time::Instant::now();
            for notif in &notifications {
                log::info!(target: "ALERT", "[盘中异动] {} ({}): {}", notif.name, notif.code, notif.message);
                if cfg.notifications && tracker.allow_desktop_notification(&notif.code, now_instant) {
                    spawn_system_notification(app, notif);
                }
            }
        }

        let mut store = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
        for q in quotes.iter() {
            store.insert(q.code.clone(), q.clone());
        }

        // Snapshot what the cache needs and persist it *after* the block, so no
        // state guard is held while blocking file I/O runs.
        let cache = crate::config::QuotesCache {
            quotes: store.values().cloned().collect(),
            trends: state.trends.lock().unwrap_or_else(|e| e.into_inner()).clone(),
            auctions: state.auction_tracker.lock().unwrap_or_else(|e| e.into_inner()).data.clone(),
        };

        (notifications, cfg.trend_engine, cache)
    };

    crate::config::save_cache(app, &cache);

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
        } else if session == crate::market::Session::ClosingAuction {
            for q in &quotes {
                auction_tracker.update_quote(session, q);
            }
        } else {
            for q in &quotes {
                auction_tracker.ensure_cold_start_entry(q);
            }
        }
    }

    record_success(app, &quotes);

    // Match pending limit orders against fresh quotes
    {
        let state = app.state::<AppState>();
        let mut portfolio_guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        let quotes_guard = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
        let filled = crate::portfolio::match_pending_orders(&mut portfolio_guard, &quotes_guard);
        if !filled.is_empty() {
            let _ = crate::portfolio::storage::save(app, &portfolio_guard);
            drop(portfolio_guard);
            drop(quotes_guard);
            crate::commands::portfolio::sync_watchlist_costs(app, &state);
        }
    }

    emit_snapshot(app);
    Ok(())
}
