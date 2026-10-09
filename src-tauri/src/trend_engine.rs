//! Trend Engine: Local intraday volume-price and VWAP structure analysis.
//!
//! Evaluates:
//! - Real-time VWAP and index dynamic moving averages (MA20)
//! - VWAP slope / angle of ascent/descent
//! - Time-adaptive volume ratio (local minute volume vs moving average)
//! - Multi-peak and multi-trough volume-price divergence (顶背离 / 底背离)
//! - VWAP support pullbacks and resistance touches
//! - Context-aware overbought / oversold guards (avoids flagging down stocks as overbought)
//! - Composite score (-100 to +100) and human-readable diagnosis

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::quote::{Quote, Trend};

/// Qualitative state of the intraday volume-price structure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrendState {
    /// 突破回踩：在分时均线上方运行，回踩均线获得支撑企稳
    BreakoutPullback,
    /// 放量拉升：成交量显著放大且价格向上突破
    VolumeSurge,
    /// 稳步多头：均线呈多头仰角，价格稳居均线上方
    SteadyBull,
    /// 顶背离：二次冲高逼近/突破前高但成交量显著衰竭
    TopDivergence,
    /// 放量破位：放量跌破分时均线，形态转弱
    Breakdown,
    /// 反抽承压：在均线下方运行，向上触碰均线受阻回落
    VwapResistance,
    /// 冲高乖离：日内大涨且短线急拉偏离均价线过远，乖离率高
    VwapOverbought,
    /// 探底乖离：日内大跌且短线急跌偏离均价线过远，乖离率负值大
    VwapOversold,
    /// 触底反弹：二次探底抛压衰竭或放量收复分时均线
    BottomRebound,
    /// 窄幅整理：价格紧贴均线窄幅震荡，成交量平稳
    Consolidation,
    /// 趋势平衡：多空相对平衡，无极端形态
    Neutral,
}

impl TrendState {
    pub fn label(self) -> &'static str {
        match self {
            TrendState::BreakoutPullback => "▲ 突破回踩",
            TrendState::VolumeSurge => "▲ 放量拉升",
            TrendState::SteadyBull => "▲ 稳步多头",
            TrendState::TopDivergence => "▼ 顶背离",
            TrendState::Breakdown => "▼ 放量破位",
            TrendState::VwapResistance => "▼ 反抽承压",
            TrendState::VwapOverbought => "⚡ 冲高乖离",
            TrendState::VwapOversold => "⚡ 探底乖离",
            TrendState::BottomRebound => "▲ 触底反弹",
            TrendState::Consolidation => "● 窄幅整理",
            TrendState::Neutral => "● 趋势平衡",
        }
    }

    pub fn compact_label(self) -> &'static str {
        match self {
            TrendState::BreakoutPullback => "回踩",
            TrendState::VolumeSurge => "放量",
            TrendState::SteadyBull => "多头",
            TrendState::TopDivergence => "背离",
            TrendState::Breakdown => "破位",
            TrendState::VwapResistance => "承压",
            TrendState::VwapOverbought => "超买",
            TrendState::VwapOversold => "超跌",
            TrendState::BottomRebound => "反弹",
            TrendState::Consolidation => "整理",
            TrendState::Neutral => "平衡",
        }
    }
}

/// Analysis output produced by the Trend Engine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrendSignal {
    pub state: TrendState,
    pub label: String,
    pub compact_label: String,
    pub score: i32,
    pub bias_pct: f64,
    pub summary: String,
    pub updated_at: u64,
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Check if a symbol represents an index (no per-share VWAP)
fn is_index_symbol(code: &str) -> bool {
    code.starts_with("sh000")
        || code.starts_with("sz399")
        || code.starts_with("bj899")
}

/// Analyze a security's real-time quote and intraday minute trend.
pub fn analyze_trend(quote: &Quote, trend: Option<&Trend>) -> Option<TrendSignal> {
    let now = now_epoch_secs();

    // If trend points are not yet available or too short, provide basic fallback from quote.
    let points = match trend {
        Some(t) if t.points.len() >= 3 => &t.points,
        _ => {
            let bias = if quote.pre_close > 0.0 {
                (quote.price - quote.pre_close) / quote.pre_close * 100.0
            } else {
                0.0
            };
            let (state, score, summary) = if quote.change_pct >= 3.0 {
                (TrendState::VwapOverbought, 25, "日内涨幅偏大，远离昨收基准".into())
            } else if quote.change_pct <= -3.0 {
                (TrendState::VwapOversold, -25, "日内跌幅偏大，远离昨收基准".into())
            } else {
                (TrendState::Neutral, 0, "等待分时时序数据就绪...".into())
            };
            return Some(TrendSignal {
                state,
                label: state.label().into(),
                compact_label: state.compact_label().into(),
                score,
                bias_pct: (bias * 100.0).round() / 100.0,
                summary,
                updated_at: now,
            });
        }
    };

    let len = points.len();
    let latest = &points[len - 1];
    let price = if quote.price > 0.0 { quote.price } else { latest.price };

    if price <= 0.0 {
        return None;
    }

    // Determine the benchmark curve:
    // For single stocks, use derived avg_price (VWAP).
    // For indices or if avg_price is unavailable, use rolling MA20 of minute prices.
    let is_index = is_index_symbol(&quote.code) || latest.avg_price <= 0.0;
    let mut benchmark_curve: Vec<f64> = Vec::with_capacity(len);

    if is_index {
        for i in 0..len {
            let window_start = if i >= 20 { i + 1 - 20 } else { 0 };
            let slice = &points[window_start..=i];
            let sum: f64 = slice.iter().map(|p| p.price).sum();
            benchmark_curve.push(sum / (slice.len() as f64));
        }
    } else {
        for p in points.iter() {
            let bm = if p.avg_price > 0.0 { p.avg_price } else { p.price };
            benchmark_curve.push(bm);
        }
    }

    let benchmark = benchmark_curve[len - 1];
    if benchmark <= 0.0 {
        return None;
    }

    // Intraday Bias percentage: (price - benchmark) / benchmark * 100%
    let bias_pct = (price - benchmark) / benchmark * 100.0;
    let rounded_bias = (bias_pct * 100.0).round() / 100.0;

    // Trendline slope over the last 15 minutes (or available length)
    let slope_window = len.min(15);
    let past_bm = benchmark_curve[len - slope_window];
    let slope_pct = if past_bm > 0.0 {
        (benchmark - past_bm) / past_bm * 100.0
    } else {
        0.0
    };

    // Calculate per-minute volume series
    let mut minute_volumes: Vec<f64> = Vec::with_capacity(len);
    for i in 0..len {
        let prev_cum = if i == 0 { 0.0 } else { points[i - 1].cum_volume };
        let vol = (points[i].cum_volume - prev_cum).max(0.0);
        minute_volumes.push(vol);
    }

    // Dynamic volume ratio: compare recent 4 minutes to a rolling 20-minute local baseline.
    // This avoids distorting the afternoon session where whole-market volume naturally contracts.
    let base_window = len.min(20);
    let base_vol = minute_volumes[len - base_window..].iter().sum::<f64>() / (base_window as f64);
    let recent_window = len.min(4);
    let recent_vol = minute_volumes[len - recent_window..].iter().sum::<f64>() / (recent_window as f64);
    let vol_ratio = if base_vol > 0.0 { recent_vol / base_vol } else { 1.0 };

    // Price dynamics over recent 15 minutes
    let lookback_price = len.min(15);
    let recent_points = &points[len - lookback_price..];
    let recent_min_price = recent_points.iter().map(|p| p.price).fold(f64::INFINITY, f64::min);
    let recent_max_price = recent_points.iter().map(|p| p.price).fold(f64::NEG_INFINITY, f64::max);

    // -------------------------------------------------------------
    // Pattern 1: Extreme Bias Guards (Overbought & Oversold)
    // -------------------------------------------------------------
    // GUARD: Overbought is ONLY valid on stocks that are genuinely up today (change_pct >= 1.2%)!
    if quote.change_pct >= 1.2 && bias_pct >= 2.2 && price > benchmark {
        return Some(TrendSignal {
            state: TrendState::VwapOverbought,
            label: TrendState::VwapOverbought.label().into(),
            compact_label: TrendState::VwapOverbought.compact_label().into(),
            score: 25,
            bias_pct: rounded_bias,
            summary: format!(
                "日内涨幅 +{:.2}% 且偏离均线 +{bias_pct:.2}%，分时乖离过大，谨防追高回踩",
                quote.change_pct
            ),
            updated_at: now,
        });
    }

    // GUARD: Oversold is ONLY valid on stocks that are genuinely down today (change_pct <= -1.2%)!
    if quote.change_pct <= -1.2 && bias_pct <= -2.2 && price < benchmark {
        return Some(TrendSignal {
            state: TrendState::VwapOversold,
            label: TrendState::VwapOversold.label().into(),
            compact_label: TrendState::VwapOversold.compact_label().into(),
            score: -25,
            bias_pct: rounded_bias,
            summary: format!(
                "日内跌幅 {:.2}% 且偏离均线 {bias_pct:.2}%，短线极度超跌，关注反抽修复",
                quote.change_pct
            ),
            updated_at: now,
        });
    }

    // -------------------------------------------------------------
    // Pattern 2: Dual-Peak Top Divergence (顶背离) & Dual-Trough Bottom Divergence (底背离)
    // -------------------------------------------------------------
    if len >= 18 {
        // Top Divergence: Stock is positive today, earlier peak P1 had high volume,
        // recent peak P2 tests P1 but volume dried up significantly (> 40% reduction).
        if quote.change_pct >= 0.2 || price >= quote.pre_close {
            let p1_end = len - 7;
            let (p1_idx, p1_price) = points[0..p1_end]
                .iter()
                .enumerate()
                .fold((0, f64::NEG_INFINITY), |(max_i, max_p), (i, p)| {
                    if p.price > max_p { (i, p.price) } else { (max_i, max_p) }
                });

            let (p2_idx, p2_price) = points[p1_end..len]
                .iter()
                .enumerate()
                .fold((0, f64::NEG_INFINITY), |(max_i, max_p), (i, p)| {
                    if p.price > max_p { (i, p.price) } else { (max_i, max_p) }
                });
            let p2_idx = p1_end + p2_idx;

            // P1 should be an evident intraday high above pre_close
            if p1_price > quote.pre_close && p2_price >= p1_price * 0.997 {
                // Calculate average volume around P1 (+/- 2 minutes)
                let p1_vstart = p1_idx.saturating_sub(2);
                let p1_vend = (p1_idx + 3).min(p1_end);
                let p1_slice = &minute_volumes[p1_vstart..p1_vend];
                let p1_avg_vol = if !p1_slice.is_empty() {
                    p1_slice.iter().sum::<f64>() / (p1_slice.len() as f64)
                } else {
                    0.0
                };

                // Calculate average volume around P2
                let p2_vstart = p2_idx.saturating_sub(2);
                let p2_vend = (p2_idx + 3).min(len);
                let p2_slice = &minute_volumes[p2_vstart..p2_vend];
                let p2_avg_vol = if !p2_slice.is_empty() {
                    p2_slice.iter().sum::<f64>() / (p2_slice.len() as f64)
                } else {
                    0.0
                };

                // If P2 volume is < 60% of P1 volume, and price starts pulling back from P2
                if p1_avg_vol > 0.0 && p2_avg_vol <= p1_avg_vol * 0.60 && price <= p2_price * 0.999 {
                    return Some(TrendSignal {
                        state: TrendState::TopDivergence,
                        label: TrendState::TopDivergence.label().into(),
                        compact_label: TrendState::TopDivergence.compact_label().into(),
                        score: -65,
                        bias_pct: rounded_bias,
                        summary: "二次冲击盘中高点但量能衰竭（量缩逾40%），短线顶背离风险显著".into(),
                        updated_at: now,
                    });
                }
            }
        }

        // Bottom Divergence: Stock is negative today, earlier trough T1 had heavy volume,
        // recent trough T2 tests T1 with dried up volume, and price stabilizes.
        if quote.change_pct <= -0.2 || price < quote.pre_close {
            let t1_end = len - 7;
            let (t1_idx, t1_price) = points[0..t1_end]
                .iter()
                .enumerate()
                .fold((0, f64::INFINITY), |(min_i, min_p), (i, p)| {
                    if p.price < min_p { (i, p.price) } else { (min_i, min_p) }
                });

            let (t2_idx, t2_price) = points[t1_end..len]
                .iter()
                .enumerate()
                .fold((0, f64::INFINITY), |(min_i, min_p), (i, p)| {
                    if p.price < min_p { (i, p.price) } else { (min_i, min_p) }
                });
            let t2_idx = t1_end + t2_idx;

            if t1_price < quote.pre_close && t2_price <= t1_price * 1.003 {
                let t1_vstart = t1_idx.saturating_sub(2);
                let t1_vend = (t1_idx + 3).min(t1_end);
                let t1_slice = &minute_volumes[t1_vstart..t1_vend];
                let t1_avg_vol = if !t1_slice.is_empty() {
                    t1_slice.iter().sum::<f64>() / (t1_slice.len() as f64)
                } else {
                    0.0
                };

                let t2_vstart = t2_idx.saturating_sub(2);
                let t2_vend = (t2_idx + 3).min(len);
                let t2_slice = &minute_volumes[t2_vstart..t2_vend];
                let t2_avg_vol = if !t2_slice.is_empty() {
                    t2_slice.iter().sum::<f64>() / (t2_slice.len() as f64)
                } else {
                    0.0
                };

                if t1_avg_vol > 0.0 && t2_avg_vol <= t1_avg_vol * 0.60 && price >= t2_price * 1.001 {
                    return Some(TrendSignal {
                        state: TrendState::BottomRebound,
                        label: TrendState::BottomRebound.label().into(),
                        compact_label: TrendState::BottomRebound.compact_label().into(),
                        score: 55,
                        bias_pct: rounded_bias,
                        summary: "二次探底抛压显著衰竭，均线下方缩量企稳，呈现底背离修复特征".into(),
                        updated_at: now,
                    });
                }
            }
        }
    }

    // -------------------------------------------------------------
    // Pattern 3: Volume Surge (放量拉升)
    // -------------------------------------------------------------
    if vol_ratio >= 1.7 && price > benchmark && price >= recent_min_price * 1.002 && slope_pct >= -0.05 {
        let score = (55.0 + (vol_ratio * 10.0).min(30.0)) as i32;
        return Some(TrendSignal {
            state: TrendState::VolumeSurge,
            label: TrendState::VolumeSurge.label().into(),
            compact_label: TrendState::VolumeSurge.compact_label().into(),
            score,
            bias_pct: rounded_bias,
            summary: format!("短线放量异动（量比 {vol_ratio:.1}x），多头买盘推升价格走强"),
            updated_at: now,
        });
    }

    // -------------------------------------------------------------
    // Pattern 4: Breakdown (放量破位)
    // -------------------------------------------------------------
    if vol_ratio >= 1.5 && price < benchmark && price <= recent_max_price * 0.998 && bias_pct <= -0.3 {
        return Some(TrendSignal {
            state: TrendState::Breakdown,
            label: TrendState::Breakdown.label().into(),
            compact_label: TrendState::Breakdown.compact_label().into(),
            score: -70,
            bias_pct: rounded_bias,
            summary: format!("放量跌破分时均线（量比 {vol_ratio:.1}x），短线抛压加剧，形态走弱"),
            updated_at: now,
        });
    }

    // -------------------------------------------------------------
    // Pattern 5: Breakout Pullback (突破回踩企稳)
    // -------------------------------------------------------------
    let tested_vwap_support = recent_min_price <= benchmark * 1.003 && recent_min_price >= benchmark * 0.995;
    if price >= benchmark && bias_pct <= 0.85 && tested_vwap_support && price > recent_min_price && slope_pct >= -0.03 && vol_ratio < 1.35 {
        return Some(TrendSignal {
            state: TrendState::BreakoutPullback,
            label: TrendState::BreakoutPullback.label().into(),
            compact_label: TrendState::BreakoutPullback.compact_label().into(),
            score: 70,
            bias_pct: rounded_bias,
            summary: "回踩分时均线企稳不破，量能收缩，均线支撑强劲".into(),
            updated_at: now,
        });
    }

    // -------------------------------------------------------------
    // Pattern 6: VWAP Resistance (反抽承压)
    // -------------------------------------------------------------
    let tested_vwap_resistance = recent_max_price >= benchmark * 0.996 && recent_max_price <= benchmark * 1.005;
    if price < benchmark && bias_pct >= -1.2 && tested_vwap_resistance && price < recent_max_price && slope_pct <= 0.05 {
        return Some(TrendSignal {
            state: TrendState::VwapResistance,
            label: TrendState::VwapResistance.label().into(),
            compact_label: TrendState::VwapResistance.compact_label().into(),
            score: -50,
            bias_pct: rounded_bias,
            summary: "反抽分时均线受阻遇压，未能有效站上，均线反压明显".into(),
            updated_at: now,
        });
    }

    // -------------------------------------------------------------
    // Pattern 7: Steady Bull (稳步多头)
    // -------------------------------------------------------------
    if price > benchmark && bias_pct >= 0.25 && bias_pct <= 2.2 && slope_pct >= 0.07 && vol_ratio >= 0.75 {
        return Some(TrendSignal {
            state: TrendState::SteadyBull,
            label: TrendState::SteadyBull.label().into(),
            compact_label: TrendState::SteadyBull.compact_label().into(),
            score: 45,
            bias_pct: rounded_bias,
            summary: "均线呈多头仰角上行，价格依托均线稳步推升".into(),
            updated_at: now,
        });
    }

    // -------------------------------------------------------------
    // Pattern 8: Consolidation (窄幅整理)
    // -------------------------------------------------------------
    let range_pct = (recent_max_price - recent_min_price) / benchmark * 100.0;
    if bias_pct.abs() <= 0.35 && range_pct < 0.65 && vol_ratio <= 1.25 {
        return Some(TrendSignal {
            state: TrendState::Consolidation,
            label: TrendState::Consolidation.label().into(),
            compact_label: TrendState::Consolidation.compact_label().into(),
            score: 0,
            bias_pct: rounded_bias,
            summary: "价格贴合均价线窄幅纠缠，量能平稳，处于蓄势整理阶段".into(),
            updated_at: now,
        });
    }

    // -------------------------------------------------------------
    // Pattern 9: General Neutral / Balanced
    // -------------------------------------------------------------
    let (score, label, compact_label, summary) = if price >= benchmark {
        let s = (bias_pct * 15.0).clamp(5.0, 30.0) as i32;
        (
            s,
            "● 均线上方",
            "多方",
            format!("均线上方偏强震荡，偏离均线 +{bias_pct:.2}%"),
        )
    } else {
        let s = (bias_pct * 15.0).clamp(-30.0, -5.0) as i32;
        (
            s,
            "● 均线下方",
            "空方",
            format!("均线下方弱势运行，偏离均线 {bias_pct:.2}%"),
        )
    };

    Some(TrendSignal {
        state: TrendState::Neutral,
        label: label.into(),
        compact_label: compact_label.into(),
        score,
        bias_pct: rounded_bias,
        summary,
        updated_at: now,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quote::TrendPoint;

    fn mock_quote(code: &str, price: f64, pre_close: f64, change_pct: f64) -> Quote {
        Quote {
            code: code.into(),
            name: "测试标的".into(),
            price,
            pre_close,
            open: pre_close,
            high: price.max(pre_close * 1.05),
            low: price.min(pre_close * 0.95),
            volume: 100000.0,
            change: price - pre_close,
            change_pct,
            date: "20261009".into(),
            time: "14:00:00".into(),
        }
    }

    fn mock_trend(code: &str, prices_and_vols: &[(f64, f64)], pre_close: f64, force_zero_avg: bool) -> Trend {
        let mut points = Vec::new();
        let mut cum_vol = 0.0;
        let mut cum_amt = 0.0;

        for (i, &(p, v)) in prices_and_vols.iter().enumerate() {
            cum_vol += v;
            cum_amt += p * v * 100.0;
            let avg = if force_zero_avg {
                0.0
            } else if cum_vol > 0.0 {
                cum_amt / (cum_vol * 100.0)
            } else {
                p
            };
            points.push(TrendPoint {
                time: 930 + (i as u32),
                price: p,
                cum_volume: cum_vol,
                cum_amount: cum_amt,
                avg_price: avg,
            });
        }

        Trend {
            code: code.into(),
            date: "20261009".into(),
            pre_close,
            points,
        }
    }

    #[test]
    fn detects_overbought_only_on_green_day() {
        let mut pv = Vec::new();
        for _ in 0..15 {
            pv.push((10.0, 100.0));
        }
        pv.push((10.30, 100.0)); // > 2.2% bias

        let t = mock_trend("sh600000", &pv, 10.0, false);

        // Case A: Stock is up +3.0% today -> Overbought
        let q_up = mock_quote("sh600000", 10.30, 10.0, 3.0);
        let sig_up = analyze_trend(&q_up, Some(&t)).unwrap();
        assert_eq!(sig_up.state, TrendState::VwapOverbought);
        assert_eq!(sig_up.compact_label, "超买");

        // Case B: Stock is down -0.95% today (like 中天科技) -> Must NOT trigger Overbought!
        let q_down = mock_quote("sh600000", 10.30, 10.40, -0.95);
        let sig_down = analyze_trend(&q_down, Some(&t)).unwrap();
        assert_ne!(sig_down.state, TrendState::VwapOverbought);
    }

    #[test]
    fn detects_oversold_only_on_red_day() {
        let mut pv = Vec::new();
        for _ in 0..15 {
            pv.push((10.0, 100.0));
        }
        pv.push((9.70, 100.0)); // < -2.2% bias

        let t = mock_trend("sh600000", &pv, 10.0, false);

        // Case A: Down -3.0% today -> Oversold
        let q_down = mock_quote("sh600000", 9.70, 10.0, -3.0);
        let sig_down = analyze_trend(&q_down, Some(&t)).unwrap();
        assert_eq!(sig_down.state, TrendState::VwapOversold);
        assert_eq!(sig_down.compact_label, "超跌");

        // Case B: Up +1.5% today -> Must NOT trigger Oversold!
        let q_up = mock_quote("sh600000", 9.70, 9.55, 1.57);
        let sig_up = analyze_trend(&q_up, Some(&t)).unwrap();
        assert_ne!(sig_up.state, TrendState::VwapOversold);
    }

    #[test]
    fn detects_top_divergence_dual_peak() {
        let mut pv = Vec::new();
        // Baseline 0..10
        for _ in 0..10 {
            pv.push((10.0, 50.0));
        }
        // Peak 1 around minute 12 with huge volume (300)
        pv.push((10.15, 150.0));
        pv.push((10.25, 300.0)); // P1
        pv.push((10.20, 100.0));
        // Pullback minute 14..18
        pv.push((10.10, 40.0));
        pv.push((10.08, 30.0));
        pv.push((10.12, 35.0));
        // Peak 2 minute 19..22 tests P1 price (10.25) but volume dried up (40 vs 300)
        pv.push((10.20, 45.0));
        pv.push((10.25, 40.0)); // P2 with < 30% volume!
        pv.push((10.24, 30.0)); // stagnates/retreats
        pv.push((10.23, 25.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 10.23, 10.0, 2.3);
        let sig = analyze_trend(&q, Some(&t)).unwrap();

        assert_eq!(sig.state, TrendState::TopDivergence);
        assert_eq!(sig.compact_label, "背离");
        assert!(sig.score <= -60);
    }

    #[test]
    fn index_uses_ma20_and_does_not_false_divergence() {
        let mut pv = Vec::new();
        for _ in 0..25 {
            pv.push((3300.0, 5000.0));
        }
        // Index symbol sh000001 with avg_price = 0.0
        let t = mock_trend("sh000001", &pv, 3290.0, true);
        let q = mock_quote("sh000001", 3300.0, 3290.0, 0.3);
        let sig = analyze_trend(&q, Some(&t)).unwrap();

        // Should calculate smoothly using MA20 and not falsely report divergence
        assert_ne!(sig.state, TrendState::TopDivergence);
    }

    #[test]
    fn detects_volume_surge() {
        let mut pv = Vec::new();
        for _ in 0..20 {
            pv.push((10.0, 50.0));
        }
        // Sudden surge with volume 250 (5x) and rising price
        pv.push((10.05, 200.0));
        pv.push((10.10, 250.0));
        pv.push((10.15, 300.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 10.15, 10.0, 1.5);
        let sig = analyze_trend(&q, Some(&t)).unwrap();

        assert_eq!(sig.state, TrendState::VolumeSurge);
        assert_eq!(sig.compact_label, "放量");
        assert!(sig.score >= 60);
    }

    #[test]
    fn detects_breakout_pullback() {
        let mut pv = Vec::new();
        // Base rally around 10.10 to 10.18
        for _ in 0..15 {
            pv.push((10.15, 100.0));
        }
        // Pullback towards VWAP (~10.15), dipping to 10.16 and bouncing to 10.18
        pv.push((10.16, 20.0)); // low volume dip
        pv.push((10.18, 25.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 10.18, 10.0, 1.8);
        let sig = analyze_trend(&q, Some(&t)).unwrap();

        assert_eq!(sig.state, TrendState::BreakoutPullback);
        assert_eq!(sig.compact_label, "回踩");
        assert!(sig.score >= 65);
    }

    #[test]
    fn detects_breakdown() {
        let mut pv = Vec::new();
        for _ in 0..20 {
            pv.push((10.0, 50.0));
        }
        // Heavy volume breaking down below VWAP
        pv.push((9.95, 150.0));
        pv.push((9.90, 200.0));
        pv.push((9.85, 250.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 9.85, 10.0, -1.5);
        let sig = analyze_trend(&q, Some(&t)).unwrap();

        assert_eq!(sig.state, TrendState::Breakdown);
        assert_eq!(sig.compact_label, "破位");
        assert!(sig.score <= -60);
    }
}
