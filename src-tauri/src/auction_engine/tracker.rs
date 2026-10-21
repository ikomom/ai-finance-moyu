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

    pub fn set_last_date(&mut self, date: String) {
        self.last_date = date;
    }

    /// Reset tracker when trading day rolls over.
    pub fn check_date_or_reset(&mut self, today: &str) {
        if !self.last_date.is_empty() && self.last_date != today {
            self.data.clear();
        }
        self.last_date = today.to_string();
    }

    /// Ingest a quote tick during call auctions (morning 09:15–09:29 or closing 14:57–15:00).
    pub fn update_quote(&mut self, session: Session, quote: &Quote) {
        if !session.is_call_auction() && session != Session::PreTrade {
            return;
        }

        // Indices do not have their own call auction order matching or trap patterns
        if is_index_symbol(&quote.code) {
            return;
        }

        self.check_date_or_reset(&quote.date);

        let (time_sec, raw_time, time_hhmm) = parse_time_details(&quote.time);
        let is_morning = (915..=925).contains(&time_hhmm);
        let is_closing = (1457..=1500).contains(&time_hhmm);

        if !is_morning && !is_closing {
            return;
        }

        let b1_vol = quote.bids.first().map(|b| b.1).unwrap_or(0.0);
        let a1_vol = quote.asks.first().map(|a| a.1).unwrap_or(0.0);

        let is_match_finish = (is_morning && time_hhmm == 925) || (is_closing && time_hhmm == 1500);

        let (matched_vol, unmatched_vol, unmatched_side) = if is_match_finish {
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
            closing_points: Vec::new(),
            diagnosis: None,
        });

        let target_vec = if is_morning {
            &mut entry.points
        } else {
            &mut entry.closing_points
        };

        if let Some(last) = target_vec.last_mut() {
            if last.time == time_sec {
                last.price = quote.price;
                last.volume = total_vol;
                last.matched_volume = matched_vol;
                last.unmatched_volume = unmatched_vol;
                last.unmatched_side = unmatched_side;
                last.raw_time = raw_time;
            } else if time_sec > last.time {
                target_vec.push(AuctionPoint {
                    time: time_sec,
                    raw_time,
                    price: quote.price,
                    volume: total_vol,
                    matched_volume: matched_vol,
                    unmatched_volume: unmatched_vol,
                    unmatched_side,
                });
            }
        } else {
            target_vec.push(AuctionPoint {
                time: time_sec,
                raw_time,
                price: quote.price,
                volume: total_vol,
                matched_volume: matched_vol,
                unmatched_volume: unmatched_vol,
                unmatched_side,
            });
        }

        if is_morning {
            entry.diagnosis = evaluate_auction(quote.pre_close, &entry.points);
        }
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
                    time: 92500,
                    raw_time: "09:25:00".to_string(),
                    price: quote.open,
                    volume: quote.volume,
                    matched_volume: quote.volume,
                    unmatched_volume: 0.0,
                    unmatched_side: UnmatchedSide::None,
                }],
                closing_points: Vec::new(),
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
                time: 92500,
                raw_time: "09:25:00".to_string(),
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

/// Parse time string into `(time_sec, raw_time, time_hhmm)`.
/// `time_sec` is `HHMMSS` as `u32` (e.g. `91825` or `145812`).
/// `raw_time` is formatted as `"09:18:25"`.
/// `time_hhmm` is `HHMM` (e.g. `918` or `1458`).
pub fn parse_time_details(s: &str) -> (u32, String, u32) {
    let clean = s.trim();
    let (h, m, sec) = if clean.contains(':') {
        let parts: Vec<&str> = clean.split(':').collect();
        let h: u32 = parts.first().and_then(|p| p.parse().ok()).unwrap_or(0);
        let m: u32 = parts.get(1).and_then(|p| p.parse().ok()).unwrap_or(0);
        let s: u32 = parts.get(2).and_then(|p| p.parse().ok()).unwrap_or(0);
        (h, m, s)
    } else if clean.len() >= 12 {
        let h: u32 = clean[8..10].parse().unwrap_or(0);
        let m: u32 = clean[10..12].parse().unwrap_or(0);
        let s: u32 = if clean.len() >= 14 { clean[12..14].parse().unwrap_or(0) } else { 0 };
        (h, m, s)
    } else if clean.len() >= 4 {
        let h: u32 = clean[0..2].parse().unwrap_or(0);
        let m: u32 = clean[2..4].parse().unwrap_or(0);
        let s: u32 = if clean.len() >= 6 { clean[4..6].parse().unwrap_or(0) } else { 0 };
        (h, m, s)
    } else {
        (0, 0, 0)
    };
    let time_sec = h * 10000 + m * 100 + sec;
    let time_hhmm = h * 100 + m;
    let raw_time = format!("{h:02}:{m:02}:{sec:02}");
    (time_sec, raw_time, time_hhmm)
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
