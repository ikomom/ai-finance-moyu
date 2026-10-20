//! Per-security call-auction state accumulation.
//!
//! Split from `mod.rs` to stay inside the 300-line budget (AGENTS.md §11).

use std::collections::HashMap;

use crate::market::Session;
use crate::quote::Quote;

use super::heuristics::evaluate_auction;
use super::types::*;

#[derive(Debug, Default)]
pub struct AuctionTracker {
    pub data: HashMap<String, AuctionData>,
    last_date: String,
}

impl AuctionTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reset tracker when trading day rolls over or market is before 09:15.
    pub fn check_date_or_reset(&mut self, today: &str) {
        if self.last_date != today {
            self.data.clear();
            self.last_date = today.to_string();
        }
    }

    /// Ingest a quote tick during morning auction (09:15–09:29).
    pub fn update_quote(&mut self, session: Session, quote: &Quote) {
        if !session.is_morning_auction() && session != Session::PreTrade {
            return;
        }

        // Indices do not have their own call auction order matching or trap patterns
        if is_index_symbol(&quote.code) {
            return;
        }

        self.check_date_or_reset(&quote.date);

        let time_num = parse_time_hhmm(&quote.time);
        if !(915..=925).contains(&time_num) {
            return;
        }

        let b1_vol = quote.bids.first().map(|b| b.1).unwrap_or(0.0);
        let a1_vol = quote.asks.first().map(|a| a.1).unwrap_or(0.0);

        let (matched_vol, unmatched_vol, unmatched_side) = if time_num == 925 {
            // 09:25 is formal opening trade completion: full matched volume, unmatched goes to 0
            (quote.volume.max(0.0), 0.0, UnmatchedSide::None)
        } else if b1_vol > 0.0 && a1_vol > 0.0 {
            let m = b1_vol.min(a1_vol);
            let u = (b1_vol - a1_vol).abs();
            let side = if b1_vol > a1_vol {
                UnmatchedSide::Buy
            } else if a1_vol > b1_vol {
                UnmatchedSide::Sell
            } else {
                UnmatchedSide::None
            };
            (m, u, side)
        } else if b1_vol > 0.0 && a1_vol <= 0.0 {
            (0.0, b1_vol, UnmatchedSide::Buy)
        } else if a1_vol > 0.0 && b1_vol <= 0.0 {
            (0.0, a1_vol, UnmatchedSide::Sell)
        } else {
            (quote.volume.max(0.0), 0.0, UnmatchedSide::None)
        };
        let total_vol = (matched_vol + unmatched_vol).max(quote.volume);

        let entry = self.data.entry(quote.code.clone()).or_insert_with(|| AuctionData {
            code: quote.code.clone(),
            date: quote.date.clone(),
            points: Vec::new(),
            diagnosis: None,
        });

        if let Some(last) = entry.points.last_mut() {
            if last.time == time_num {
                last.price = quote.price;
                last.volume = total_vol;
                last.matched_volume = matched_vol;
                last.unmatched_volume = unmatched_vol;
                last.unmatched_side = unmatched_side;
            } else if time_num > last.time {
                entry.points.push(AuctionPoint {
                    time: time_num,
                    price: quote.price,
                    volume: total_vol,
                    matched_volume: matched_vol,
                    unmatched_volume: unmatched_vol,
                    unmatched_side,
                });
            }
        } else {
            entry.points.push(AuctionPoint {
                time: time_num,
                price: quote.price,
                volume: total_vol,
                matched_volume: matched_vol,
                unmatched_volume: unmatched_vol,
                unmatched_side,
            });
        }

        entry.diagnosis = evaluate_auction(quote.pre_close, &entry.points);
    }

    /// If app starts after morning call auction (or runs in continuous trading), backfill a baseline 09:25 match anchor
    /// from the quote's open price so the user still gets open gap diagnosis and match anchor line.
    pub fn ensure_cold_start_entry(&mut self, quote: &Quote) {
        if is_index_symbol(&quote.code) || quote.open <= 0.0 || quote.pre_close <= 0.0 {
            return;
        }
        self.check_date_or_reset(&quote.date);
        let entry = self.data.entry(quote.code.clone()).or_insert_with(|| {
            let open_pct = ((quote.open - quote.pre_close) / quote.pre_close * 100.0 * 100.0).round() / 100.0;
            let (label, detail) = if open_pct > 0.0 {
                (
                    format!("高开 {:+.2}%", open_pct),
                    format!("09:25 开盘撮合成交价 {:.2} 元，较昨收高开 {:+.2}%。如需监控 09:15-09:25 撤单异动流，请在早盘竞价时段保持软件在线采集。", quote.open, open_pct),
                )
            } else if open_pct < 0.0 {
                (
                    format!("低开 {:+.2}%", open_pct),
                    format!("09:25 开盘撮合成交价 {:.2} 元，较昨收低开 {:+.2}%。如需监控 09:15-09:25 撤单异动流，请在早盘竞价时段保持软件在线采集。", quote.open, open_pct),
                )
            } else {
                (
                    "平开撮合 0.00%".to_string(),
                    format!("09:25 开盘撮合成交价 {:.2} 元，与昨收持平。如需监控 09:15-09:25 撤单异动流，请在早盘竞价时段保持软件在线采集。", quote.open),
                )
            };

            AuctionData {
                code: quote.code.clone(),
                date: quote.date.clone(),
                points: vec![AuctionPoint {
                    time: 925,
                    price: quote.open,
                    volume: quote.volume,
                    matched_volume: quote.volume,
                    unmatched_volume: 0.0,
                    unmatched_side: UnmatchedSide::None,
                }],
                diagnosis: Some(AuctionDiagnosis {
                    tag: AuctionTag::Normal,
                    label,
                    detail,
                    early_peak_pct: open_pct,
                    locked_pct: open_pct,
                    volume_drop_pct: None,
                }),
            }
        });

        if entry.points.is_empty() {
            entry.points.push(AuctionPoint {
                time: 925,
                price: quote.open,
                volume: quote.volume,
                matched_volume: quote.volume,
                unmatched_volume: 0.0,
                unmatched_side: UnmatchedSide::None,
            });
        }
    }
}

/// Check if a symbol represents an index (no individual call auction order matching)
pub fn is_index_symbol(code: &str) -> bool {
    code.starts_with("sh000")
        || code.starts_with("sz399")
        || code.starts_with("bj899")
}

/// Parse time string into `HHMM` u32:
/// Handles both `"09:18:25"` -> `918`, `"20261013091825"` -> `918`, or `"0918"` -> `918`.
pub fn parse_time_hhmm(s: &str) -> u32 {
    let clean = s.trim();
    if clean.contains(':') {
        let parts: Vec<&str> = clean.split(':').collect();
        if parts.len() >= 2 {
            let h: u32 = parts[0].parse().unwrap_or(0);
            let m: u32 = parts[1].parse().unwrap_or(0);
            return h * 100 + m;
        }
    } else if clean.len() >= 12 {
        // e.g. "20261013091825" -> hours at [8..10], minutes at [10..12]
        let h: u32 = clean[8..10].parse().unwrap_or(0);
        let m: u32 = clean[10..12].parse().unwrap_or(0);
        return h * 100 + m;
    } else if clean.len() >= 4 {
        let h: u32 = clean[0..2].parse().unwrap_or(0);
        let m: u32 = clean[2..4].parse().unwrap_or(0);
        return h * 100 + m;
    }
    0
}
