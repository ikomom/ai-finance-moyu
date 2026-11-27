//! Intraday trend polling and the signal pass derived from it.
//!
//! Split from `poller.rs` to stay inside the 300-line budget (AGENTS.md §11).

use tauri::{AppHandle, Manager};

use crate::quote::Quote;
use crate::state::AppState;

use super::emit_snapshot;

///   blocking or unbounded flooding, preventing CDN rate limits and high latency.
pub async fn poll_trends(app: &AppHandle) -> Result<(), String> {
    let (codes, source) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        let targets = state.active_trend_targets.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let watchlist_codes = cfg.codes();
        let final_codes = match targets {
            Some(t) => {
                let set: std::collections::HashSet<_> = watchlist_codes.into_iter().collect();
                t.into_iter().filter(|c| set.contains(c)).collect::<Vec<_>>()
            }
            None => {
                match cfg.layout {
                    crate::config::Layout::Bar
                    | crate::config::Layout::Market
                    | crate::config::Layout::Global => Vec::new(),
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
            let (pre_close, quote_date) = {
                let state = app_handle.state::<AppState>();
                let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
                quotes
                    .get(&code_clone)
                    .map(|q| (q.pre_close, q.date.clone()))
                    .unwrap_or((0.0, String::new()))
            };
            let state = app_handle.state::<AppState>();
            let fetched = state
                .fetcher
                .fetch_trend_for_quote(source, &code_clone, pre_close, &quote_date)
                .await;
            (code_clone, fetched)
        }));
    }

    for handle in handles {
        match handle.await {
            Ok((code, Ok(mut trend))) => {
                let state = app.state::<AppState>();
                let now = crate::market::beijing_now();
                let today_str = now.format("%Y%m%d").to_string();
                let (quote_date, quote_pre, market_trading_today) = {
                    let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
                    let trading = quotes.values().any(|q| q.date == today_str);
                    let (d, p) = quotes
                        .get(&code)
                        .map(|q| (q.date.clone(), q.pre_close))
                        .unwrap_or((String::new(), 0.0));
                    (d, p, trading)
                };
                crate::quote::sanitize_trend_for_quote_with_market(
                    &mut trend,
                    &quote_date,
                    quote_pre,
                    market_trading_today,
                    now,
                );
                state.trends.lock().unwrap_or_else(|e| e.into_inner()).insert(code, trend);
            }
            Ok((code, Err(e))) => {
                log::warn!(target: "NET", "分时拉取失败 {code}: {e}");
                let state = app.state::<AppState>();
                let now = crate::market::beijing_now();
                let today_str = now.format("%Y%m%d").to_string();
                let (quote_date, quote_pre, market_trading_today) = {
                    let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
                    let trading = quotes.values().any(|q| q.date == today_str);
                    let (d, p) = quotes
                        .get(&code)
                        .map(|q| (q.date.clone(), q.pre_close))
                        .unwrap_or((String::new(), 0.0));
                    (d, p, trading)
                };
                let mut trends = state.trends.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(t) = trends.get_mut(&code) {
                    crate::quote::sanitize_trend_for_quote_with_market(
                        t,
                        &quote_date,
                        quote_pre,
                        market_trading_today,
                        now,
                    );
                }
            }
            Err(e) => {
                log::error!(target: "SYSTEM", "分时拉取任务异常: {e}");
            }
        }
    }

    let cache = {
        let state = app.state::<AppState>();
        let quotes: Vec<Quote> = state
            .quotes
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .values()
            .cloned()
            .collect();
        let trends = state.trends.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let enabled = state.config.lock().unwrap_or_else(|e| e.into_inner()).trend_engine;
        update_trend_signals(&state, enabled);
        let auctions = state.auction_tracker.lock().unwrap_or_else(|e| e.into_inner()).data.clone();
        crate::config::QuotesCache { quotes, trends, auctions }
    };
    crate::config::save_cache(app, &cache);

    emit_snapshot(app);
    Ok(())
}

pub(super) fn update_trend_signals(state: &AppState, enabled: bool) {
    if !enabled {
        state.trend_signals.lock().unwrap_or_else(|e| e.into_inner()).clear();
        return;
    }

    let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
    let trends = state.trends.lock().unwrap_or_else(|e| e.into_inner());
    let overview_guard = state.market_overview.lock().unwrap_or_else(|e| e.into_inner());
    let mut signals = state.trend_signals.lock().unwrap_or_else(|e| e.into_inner());

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
            // Log diagnosis events when state transitions occur (AGENTS.md §7)
            let prev_fall_tag = signals.get(code).and_then(|s| s.fall_attribution.as_ref().map(|f| f.tag.clone()));
            let new_fall_tag = sig.fall_attribution.as_ref().map(|f| f.tag.clone());
            if new_fall_tag != prev_fall_tag {
                if let Some(ref attr) = sig.fall_attribution {
                    log::info!(
                        target: "ALERT",
                        "[归因诊断] {} ({}): 触发【{}】 - {}",
                        q.name,
                        q.code,
                        attr.tag,
                        attr.reason
                    );
                } else if let Some(ref prev_tag) = prev_fall_tag {
                    log::info!(
                        target: "ALERT",
                        "[归因诊断] {} ({}): 跌势企稳，解除【{}】预警",
                        q.name,
                        q.code,
                        prev_tag
                    );
                }
            }

            let prev_stage = signals.get(code).and_then(|s| {
                s.sector_linkage.as_ref().and_then(|l| l.sectors.first().map(|sec| (sec.name.clone(), sec.stage.clone())))
            });
            let new_stage = sig.sector_linkage.as_ref().and_then(|l| {
                l.sectors.first().map(|sec| (sec.name.clone(), sec.stage.clone()))
            });
            if new_stage != prev_stage {
                if let Some((sec_name, stage)) = new_stage {
                    let rank_info = sig.sector_linkage.as_ref()
                        .and_then(|l| l.sectors.first())
                        .map(|s| format!("今日 #{} {:+.2}%", s.rank.unwrap_or(0), s.change_pct))
                        .unwrap_or_default();
                    let concepts_preview = sig.sector_linkage.as_ref()
                        .map(|l| l.sectors.iter().take(3).map(|s| s.name.as_str()).collect::<Vec<_>>().join(" / "))
                        .unwrap_or_default();
                    log::info!(
                        target: "NET",
                        "[题材联动] {} ({}): 关联题材 [{}]，核心板块【{}】({}) 处于 [{}] 阶段",
                        q.name,
                        q.code,
                        concepts_preview,
                        sec_name,
                        rank_info,
                        stage
                    );
                }
            }

            signals.insert(code.clone(), sig);
        }
    }
}

