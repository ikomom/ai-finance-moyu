//! Call Auction (集合竞价 09:15–09:25) Diagnostic Engine.
//!
//! Tracks intraday call auction time series for watchlisted securities and identifies
//! classical A-share auction manipulation patterns:
//! - Fake bid bull trap (冲高大撤单诱多)
//! - Scare bear trap (恐吓大撤单诱空)
//! - Real accumulation / snatching (真金白银持续抢筹)
//! - Real dumping / selling pressure (开盘坚决真实抛压)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::market::Session;
use crate::quote::Quote;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UnmatchedSide {
    #[default]
    None,
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuctionTag {
    Normal,
    BullTrap,
    BearTrap,
    Snatching,
    Dumping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuctionPoint {
    /// 24h format HHMM, e.g. 915, 918, 920, 924.
    pub time: u32,
    /// Auction match price.
    pub price: f64,
    /// Total volume (matched + unmatched) in 手.
    pub volume: f64,
    /// Matched volume in 手.
    #[serde(default)]
    pub matched_volume: f64,
    /// Unmatched residual order volume in 手.
    #[serde(default)]
    pub unmatched_volume: f64,
    /// Direction of unmatched order volume.
    #[serde(default)]
    pub unmatched_side: UnmatchedSide,
}

impl AuctionPoint {
    pub fn new(time: u32, price: f64, volume: f64) -> Self {
        Self {
            time,
            price,
            volume,
            matched_volume: volume,
            unmatched_volume: 0.0,
            unmatched_side: UnmatchedSide::None,
        }
    }

    pub fn with_unmatched(
        time: u32,
        price: f64,
        matched_volume: f64,
        unmatched_volume: f64,
        unmatched_side: UnmatchedSide,
    ) -> Self {
        Self {
            time,
            price,
            volume: matched_volume + unmatched_volume,
            matched_volume,
            unmatched_volume,
            unmatched_side,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuctionDiagnosis {
    pub tag: AuctionTag,
    pub label: String,
    pub detail: String,
    pub early_peak_pct: f64,
    pub locked_pct: f64,
    pub volume_drop_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuctionData {
    pub code: String,
    pub date: String,
    pub points: Vec<AuctionPoint>,
    pub diagnosis: Option<AuctionDiagnosis>,
}

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
                    unmatched_side: unmatched_side,
                });
            }
        } else {
            entry.points.push(AuctionPoint {
                time: time_num,
                price: quote.price,
                volume: total_vol,
                matched_volume: matched_vol,
                unmatched_volume: unmatched_vol,
                unmatched_side: unmatched_side,
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

/// Heuristic evaluation of call auction time series.
/// Compares the cancelable trial phase (09:15–09:19, time < 920) against
/// the locked commitment phase (09:20–09:24, time >= 920).
pub fn evaluate_auction(pre_close: f64, points: &[AuctionPoint]) -> Option<AuctionDiagnosis> {
    if points.is_empty() || pre_close <= 0.0 {
        return None;
    }

    let early_points: Vec<&AuctionPoint> = points.iter().filter(|p| p.time < 920).collect();
    let locked_points: Vec<&AuctionPoint> = points.iter().filter(|p| p.time >= 920).collect();

    // If still in the early cancelable stage, provide preliminary tracking status
    if locked_points.is_empty() {
        let last = points.last().unwrap();
        let pct = (last.price - pre_close) / pre_close * 100.0;
        return Some(AuctionDiagnosis {
            tag: AuctionTag::Normal,
            label: "竞价试盘中".to_string(),
            detail: format!("09:15-09:19 申报可撤单阶段，当前撮合价 {:.2} ({:+.2}%)", last.price, pct),
            early_peak_pct: pct,
            locked_pct: pct,
            volume_drop_pct: None,
        });
    }

    // Cold start guard: if user starts app after 09:20 without 09:15-09:19 trial phase data,
    // avoid false BullTrap/BearTrap/Snatching/Dumping diagnoses.
    if early_points.is_empty() {
        let last = locked_points.last().unwrap();
        let pct = (last.price - pre_close) / pre_close * 100.0;
        return Some(AuctionDiagnosis {
            tag: AuctionTag::Normal,
            label: "竞价撮合中".to_string(),
            detail: format!("09:20后接入，缺少试盘阶段对比，当前撮合价 {:.2} ({:+.2}%)", last.price, pct),
            early_peak_pct: pct,
            locked_pct: pct,
            volume_drop_pct: None,
        });
    }

    // Both early and locked phases exist, perform full trap & accumulation detection
    let early_max_p = early_points
        .iter()
        .map(|p| p.price)
        .fold(f64::NEG_INFINITY, f64::max);
    let early_min_p = early_points
        .iter()
        .map(|p| p.price)
        .fold(f64::INFINITY, f64::min);
    let early_max_vol = early_points
        .iter()
        .map(|p| p.volume)
        .fold(0.0, f64::max);

    let early_max_pct = if early_max_p.is_finite() {
        (early_max_p - pre_close) / pre_close * 100.0
    } else {
        0.0
    };
    let early_min_pct = if early_min_p.is_finite() {
        (early_min_p - pre_close) / pre_close * 100.0
    } else {
        0.0
    };

    let latest_locked = locked_points.last().unwrap();
    let locked_pct = (latest_locked.price - pre_close) / pre_close * 100.0;
    let locked_vol = latest_locked.volume;

    let vol_drop = if early_max_vol > 0.0 && early_max_vol > locked_vol {
        Some((early_max_vol - locked_vol) / early_max_vol * 100.0)
    } else {
        None
    };

    // Unmatched volume peak analysis in 09:15-09:19
    let early_max_unmatched_buy = early_points
        .iter()
        .filter(|p| p.unmatched_side == UnmatchedSide::Buy)
        .map(|p| p.unmatched_volume)
        .fold(0.0, f64::max);
    let early_max_unmatched_sell = early_points
        .iter()
        .filter(|p| p.unmatched_side == UnmatchedSide::Sell)
        .map(|p| p.unmatched_volume)
        .fold(0.0, f64::max);

    let latest_unmatched_buy = if latest_locked.unmatched_side == UnmatchedSide::Buy {
        latest_locked.unmatched_volume
    } else {
        0.0
    };
    let latest_unmatched_sell = if latest_locked.unmatched_side == UnmatchedSide::Sell {
        latest_locked.unmatched_volume
    } else {
        0.0
    };

    let unmatched_buy_drop = if early_max_unmatched_buy > 0.0 && early_max_unmatched_buy > latest_unmatched_buy {
        Some((early_max_unmatched_buy - latest_unmatched_buy) / early_max_unmatched_buy * 100.0)
    } else {
        None
    };
    let unmatched_sell_drop = if early_max_unmatched_sell > 0.0 && early_max_unmatched_sell > latest_unmatched_sell {
        Some((early_max_unmatched_sell - latest_unmatched_sell) / early_max_unmatched_sell * 100.0)
    } else {
        None
    };

    // 1. 虚拉大撤单诱多 (Bull Trap)
    // 09:15-09:19 冲高 (>= +2.0%)，09:20 锁定后撤单跳水 (落差 >= 1.5% 或翻绿)
    let drop_from_peak = early_max_pct - locked_pct;
    let significant_vol_drop = vol_drop.map_or(false, |d| d >= 30.0);
    let significant_buy_cancel = unmatched_buy_drop.map_or(false, |d| d >= 50.0);

    if early_max_pct >= 2.0 && (drop_from_peak >= 1.5 || (locked_pct <= 0.0 && early_max_pct >= 1.5)) && (significant_vol_drop || significant_buy_cancel || drop_from_peak >= 2.0) {
        let cancel_desc = if let Some(bd) = unmatched_buy_drop {
            if bd >= 50.0 && early_max_unmatched_buy >= 500.0 {
                format!("，买单撤离 {:.0}%", bd)
            } else {
                vol_drop.map(|v| format!("（量能缩减 {:.0}%）", v)).unwrap_or_default()
            }
        } else {
            vol_drop.map(|v| format!("（量能缩减 {:.0}%）", v)).unwrap_or_default()
        };
        return Some(AuctionDiagnosis {
            tag: AuctionTag::BullTrap,
            label: "⚠️ 疑似诱多".to_string(),
            detail: format!(
                "早盘虚拉冲高至 +{:.1}%，09:20锁定后撤单跳水至 {:+.1}%{}，警惕开盘接盘风险",
                early_max_pct,
                locked_pct,
                cancel_desc
            ),
            early_peak_pct: early_max_pct,
            locked_pct,
            volume_drop_pct: vol_drop,
        });
    }

    // 2. 恐吓大撤单诱空 (Bear Trap)
    // 09:15-09:19 砸盘恐吓 (<= -2.0%)，09:20 锁定后撤单拉升 (反弹 >= 1.5% 或翻红)
    let rebound_from_trough = locked_pct - early_min_pct;
    let significant_sell_cancel = unmatched_sell_drop.map_or(false, |d| d >= 50.0);
    if early_min_pct <= -2.0
        && (rebound_from_trough >= 1.5 || (locked_pct >= 0.0 && early_min_pct <= -1.5))
        && (significant_vol_drop || significant_sell_cancel || rebound_from_trough >= 2.0 || locked_pct >= 0.0)
    {
        let cancel_desc = if let Some(sd) = unmatched_sell_drop {
            if sd >= 50.0 && early_max_unmatched_sell >= 500.0 {
                format!("，恐慌卖单撤离 {:.0}%", sd)
            } else {
                vol_drop.map(|v| format!("（量能缩减 {:.0}%）", v)).unwrap_or_default()
            }
        } else {
            vol_drop.map(|v| format!("（量能缩减 {:.0}%）", v)).unwrap_or_default()
        };
        return Some(AuctionDiagnosis {
            tag: AuctionTag::BearTrap,
            label: "🟢 疑似诱空".to_string(),
            detail: format!(
                "早盘恐吓深跌至 {:.1}%，09:20锁定后大单撤离拉升至 {:+.1}%{}，虚晃一枪暗含承接",
                early_min_pct,
                locked_pct,
                cancel_desc
            ),
            early_peak_pct: early_min_pct,
            locked_pct,
            volume_drop_pct: vol_drop,
        });
    }

    // 3. 真金白银强势抢筹 (Snatching)
    // 09:20 锁定后维持强势 (>= +1.5%)，且未出现明显冲高回落 (回落 < 0.8%)，量能扎实
    if locked_pct >= 1.5 && drop_from_peak < 0.8 && (early_max_vol == 0.0 || locked_vol >= early_max_vol * 0.7) {
        return Some(AuctionDiagnosis {
            tag: AuctionTag::Snatching,
            label: "🔥 真实抢筹".to_string(),
            detail: format!(
                "09:20锁定后强势维持在 +{:.1}%，买盘挂单扎实，成交意愿坚决",
                locked_pct
            ),
            early_peak_pct: early_max_pct,
            locked_pct,
            volume_drop_pct: None,
        });
    }

    // 4. 开盘坚决真实抛压 (Dumping)
    // 09:20 锁定后持续低位承压 (<= -1.5%)，无明显反弹承接 (反弹 < 0.6%)
    if locked_pct <= -1.5 && rebound_from_trough < 0.6 {
        return Some(AuctionDiagnosis {
            tag: AuctionTag::Dumping,
            label: "❄️ 真实抛压".to_string(),
            detail: format!(
                "09:20锁定后持续低位承压在 {:.1}%，卖盘堆积无明显承接，注意早盘抛压",
                locked_pct
            ),
            early_peak_pct: early_min_pct,
            locked_pct,
            volume_drop_pct: None,
        });
    }

    // 5. 竞价平稳
    Some(AuctionDiagnosis {
        tag: AuctionTag::Normal,
        label: "竞价平稳".to_string(),
        detail: format!(
            "09:20锁定撮合价 {:.2} ({:+.1}%)，量价表现平稳",
            latest_locked.price,
            locked_pct
        ),
        early_peak_pct: early_max_pct,
        locked_pct,
        volume_drop_pct: vol_drop,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_various_time_formats() {
        assert_eq!(parse_time_hhmm("09:18:25"), 918);
        assert_eq!(parse_time_hhmm("09:24:00"), 924);
        assert_eq!(parse_time_hhmm("20261013091930"), 919);
        assert_eq!(parse_time_hhmm("0920"), 920);
    }

    #[test]
    fn detects_bull_trap_fake_spike_and_cancel() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(915, 10.2, 500.0),
            AuctionPoint::new(918, 10.8, 5000.0), // +8.0%, 5000手
            AuctionPoint::new(919, 10.7, 4800.0),
            AuctionPoint::new(920, 10.1, 800.0),  // +1.0%, 800手 (撤单暴跌)
            AuctionPoint::new(924, 10.05, 900.0),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BullTrap);
        assert_eq!(diag.label, "⚠️ 疑似诱多");
    }

    #[test]
    fn detects_bull_trap_via_unmatched_buy_order_cancel() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::with_unmatched(915, 10.2, 500.0, 1000.0, UnmatchedSide::Buy),
            AuctionPoint::with_unmatched(918, 10.8, 1000.0, 5000.0, UnmatchedSide::Buy), // 5000手未匹配买单虚托
            AuctionPoint::with_unmatched(920, 10.1, 900.0, 100.0, UnmatchedSide::Buy),  // 买单大撤单98%
            AuctionPoint::with_unmatched(924, 10.05, 900.0, 50.0, UnmatchedSide::Buy),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BullTrap);
        assert!(diag.detail.contains("买单撤离"));
    }

    #[test]
    fn detects_bear_trap_scare_and_rebound() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(915, 9.8, 500.0),
            AuctionPoint::new(918, 9.2, 4000.0), // -8.0% 跌停恐吓
            AuctionPoint::new(920, 9.9, 600.0),  // 撤单拉起至 -1.0%
            AuctionPoint::new(924, 10.05, 800.0), // 翻红
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BearTrap);
        assert_eq!(diag.label, "🟢 疑似诱空");
    }

    #[test]
    fn detects_bear_trap_via_unmatched_sell_order_cancel() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::with_unmatched(915, 9.8, 400.0, 800.0, UnmatchedSide::Sell),
            AuctionPoint::with_unmatched(918, 9.2, 800.0, 4500.0, UnmatchedSide::Sell), // 4500手巨额卖单封杀恐吓
            AuctionPoint::with_unmatched(920, 9.9, 700.0, 200.0, UnmatchedSide::Sell),  // 恐慌卖单撤离
            AuctionPoint::with_unmatched(924, 10.05, 800.0, 100.0, UnmatchedSide::Buy),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BearTrap);
        assert!(diag.detail.contains("恐慌卖单撤离"));
    }

    #[test]
    fn detects_real_snatching() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(916, 10.2, 1000.0),
            AuctionPoint::new(919, 10.4, 2500.0),
            AuctionPoint::new(920, 10.45, 3000.0),
            AuctionPoint::new(924, 10.5, 3500.0), // +5.0% 持续放量
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::Snatching);
        assert_eq!(diag.label, "🔥 真实抢筹");
    }

    #[test]
    fn detects_real_dumping() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(916, 9.7, 1000.0),
            AuctionPoint::new(919, 9.5, 2000.0),
            AuctionPoint::new(920, 9.4, 2800.0),
            AuctionPoint::new(924, 9.35, 3200.0), // -6.5% 持续沉重
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::Dumping);
        assert_eq!(diag.label, "❄️ 真实抛压");
    }

    #[test]
    fn calculates_matched_and_unmatched_volume_from_quote() {
        let mut tracker = AuctionTracker::new();
        // Quote at 09:18 with Bids: 1500手, Asks: 500手 (Excess Buy)
        let q1 = Quote {
            code: "sh600000".into(),
            name: "浦发银行".into(),
            price: 10.5,
            pre_close: 10.0,
            open: 0.0,
            high: 0.0,
            low: 0.0,
            volume: 0.0,
            bids: vec![(10.5, 1500.0)],
            asks: vec![(10.5, 500.0)],
            date: "20261015".into(),
            time: "09:18:00".into(),
            ..Default::default()
        };
        tracker.update_quote(Session::CallAuctionCancelable, &q1);
        let data = tracker.data.get("sh600000").expect("auction data present");
        assert_eq!(data.points.len(), 1);
        let p = &data.points[0];
        assert_eq!(p.time, 918);
        assert_eq!(p.matched_volume, 500.0);
        assert_eq!(p.unmatched_volume, 1000.0);
        assert_eq!(p.unmatched_side, UnmatchedSide::Buy);
        assert_eq!(p.volume, 1500.0);

        // At 09:25: opening matched anchor
        let q2 = Quote {
            code: "sh600000".into(),
            name: "浦发银行".into(),
            price: 10.4,
            pre_close: 10.0,
            open: 10.4,
            high: 10.4,
            low: 10.4,
            volume: 2000.0,
            bids: vec![(10.4, 0.0)],
            asks: vec![(10.4, 0.0)],
            date: "20261015".into(),
            time: "09:25:00".into(),
            ..Default::default()
        };
        tracker.update_quote(Session::PreTrade, &q2);
        let data = tracker.data.get("sh600000").expect("auction data present");
        assert_eq!(data.points.len(), 2);
        let p2 = &data.points[1];
        assert_eq!(p2.time, 925);
        assert_eq!(p2.matched_volume, 2000.0);
        assert_eq!(p2.unmatched_volume, 0.0);
        assert_eq!(p2.unmatched_side, UnmatchedSide::None);
    }

    #[test]
    fn skips_index_symbols_in_auction_tracking() {
        assert!(is_index_symbol("sh000001"));
        assert!(is_index_symbol("sz399001"));
        assert!(is_index_symbol("sz399006"));
        assert!(is_index_symbol("bj899050"));
        assert!(!is_index_symbol("sh600000"));
        assert!(!is_index_symbol("sz000001"));

        let mut tracker = AuctionTracker::new();
        let index_q = Quote {
            code: "sh000001".into(),
            name: "上证指数".into(),
            price: 3300.0,
            pre_close: 3280.0,
            open: 3300.0,
            high: 3300.0,
            low: 3280.0,
            volume: 10000.0,
            change: 20.0,
            change_pct: 0.61,
            date: "20261013".into(),
            time: "09:24:00".into(),
            ..Default::default()
        };
        tracker.update_quote(Session::CallAuctionLocked, &index_q);
        assert!(!tracker.data.contains_key("sh000001"), "Index should not be tracked in auction data");
    }

    #[test]
    fn cold_start_after_920_returns_normal_diagnosis() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(922, 10.3, 2000.0),
            AuctionPoint::new(924, 10.35, 2500.0),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::Normal);
        assert_eq!(diag.label, "竞价撮合中");
        assert!(diag.detail.contains("缺少试盘阶段对比"));
    }
}
