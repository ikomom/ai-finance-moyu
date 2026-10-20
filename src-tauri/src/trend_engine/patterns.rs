//! The first seven trend patterns (overbought/oversold, divergence, spring,
//! order-flow, ORB, volume surge, breakdown).
//!
//! Split from `analyze.rs` so each file stays inside the 300-line budget
//! (AGENTS.md §11). The bodies are unchanged; every value they read arrives via
//! [`PatternCtx`], and the signal constructor is passed in so the timestamp and
//! sector linkage stay owned by the caller.

use crate::quote::{Quote, TrendPoint};

use super::types::{TrendSignal, TrendState};

pub(super) struct PatternCtx<'a> {
    pub quote: &'a Quote,
    pub points: &'a [TrendPoint],
    pub len: usize,
    pub latest: &'a TrendPoint,
    pub price: f64,
    pub benchmark: f64,
    pub bias_pct: f64,
    pub slope_pct: f64,
    pub vol_ratio: f64,
    pub recent_min_price: f64,
    pub recent_max_price: f64,
    pub minute_volumes: &'a [f64],
    pub orb_high: Option<f64>,
    pub orb_low: Option<f64>,
}

pub(super) fn early_patterns(
    ctx: &PatternCtx<'_>,
    make_signal: &dyn Fn(TrendState, i32, String) -> TrendSignal,
) -> Option<TrendSignal> {
    let quote = ctx.quote;
    let points = ctx.points;
    let len = ctx.len;
    let latest = ctx.latest;
    let price = ctx.price;
    let benchmark = ctx.benchmark;
    let bias_pct = ctx.bias_pct;
    let slope_pct = ctx.slope_pct;
    let vol_ratio = ctx.vol_ratio;
    let recent_min_price = ctx.recent_min_price;
    let recent_max_price = ctx.recent_max_price;
    let minute_volumes = ctx.minute_volumes;
    let orb_high = ctx.orb_high;
    let orb_low = ctx.orb_low;

    // -------------------------------------------------------------
    // Pattern 1: Extreme Bias Guards (Overbought & Oversold)
    // -------------------------------------------------------------
    // GUARD: Overbought is ONLY valid on stocks that are genuinely up today (change_pct >= 1.2%)!
    if quote.change_pct >= 1.2 && bias_pct >= 2.2 && price > benchmark {
        return Some(make_signal(
            TrendState::VwapOverbought,
            25,
            format!("日内涨幅 +{:.2}% 且偏离均线 +{bias_pct:.2}%，分时乖离过大，谨防追高回踩", quote.change_pct),
        ));
    }

    // GUARD: Oversold is ONLY valid on stocks that are genuinely down today (change_pct <= -1.2%)!
    if quote.change_pct <= -1.2 && bias_pct <= -2.2 && price < benchmark {
        return Some(make_signal(
            TrendState::VwapOversold,
            -25,
            format!("日内跌幅 {:.2}% 且偏离均线 {bias_pct:.2}%，短线极度超跌，关注反抽修复", quote.change_pct),
        ));
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

            if (p2_idx.saturating_sub(p1_idx)) >= 6 && p1_price > quote.pre_close && p2_price >= p1_price * 0.997 {
                let trough_min = points[p1_idx..=p2_idx]
                    .iter()
                    .map(|p| p.price)
                    .fold(f64::INFINITY, f64::min);

                if trough_min <= p1_price * 0.993 {
                    let p1_vstart = p1_idx.saturating_sub(2);
                    let p1_vend = (p1_idx + 3).min(p1_end);
                    let p1_slice = &minute_volumes[p1_vstart..p1_vend];
                    let p1_avg_vol = if !p1_slice.is_empty() {
                        p1_slice.iter().sum::<f64>() / (p1_slice.len() as f64)
                    } else {
                        0.0
                    };

                    let p2_vstart = p2_idx.saturating_sub(2);
                    let p2_vend = (p2_idx + 3).min(len);
                    let p2_slice = &minute_volumes[p2_vstart..p2_vend];
                    let p2_avg_vol = if !p2_slice.is_empty() {
                        p2_slice.iter().sum::<f64>() / (p2_slice.len() as f64)
                    } else {
                        0.0
                    };

                    if p1_avg_vol > 0.0 && p2_avg_vol <= p1_avg_vol * 0.60 && price <= p2_price * 0.999 {
                        return Some(make_signal(
                            TrendState::TopDivergence,
                            -65,
                            "二次冲击盘中高点但量能衰竭（量缩逾40%），短线顶背离风险显著".into(),
                        ));
                    }
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

            if (t2_idx.saturating_sub(t1_idx)) >= 6 && t1_price < quote.pre_close && t2_price <= t1_price * 1.003 {
                let crest_max = points[t1_idx..=t2_idx]
                    .iter()
                    .map(|p| p.price)
                    .fold(f64::NEG_INFINITY, f64::max);

                if crest_max >= t1_price * 1.007 {
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
                        return Some(make_signal(
                            TrendState::BottomRebound,
                            55,
                            "二次探底抛压显著衰竭，均线下方缩量企稳，呈现底背离修复特征".into(),
                        ));
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------
    // Pattern 3: False Breakdown / Spring (极值破底翻判定)
    // -------------------------------------------------------------
    // 跌破关键支撑诱空后，迅速放量收回支撑/VWAP之上，主动买盘回补
    if len >= 6 && (quote.active_buy_ratio >= 0.58 || (quote.outer_vol > quote.inner_vol * 1.25 && quote.outer_vol > 0.0)) {
        let recent_slice = &points[len.saturating_sub(5)..len];
        let min_p = recent_slice.iter().map(|p| p.price).fold(f64::INFINITY, f64::min);
        let min_idx = recent_slice.iter().position(|p| (p.price - min_p).abs() < 1e-6).unwrap_or(0);
        if min_idx < recent_slice.len() - 1 && min_p < benchmark * 0.9975 && price >= benchmark * 0.9995 {
            return Some(make_signal(
                TrendState::SpringRebound,
                75,
                "盘中跌破关键支撑后迅速放量收回均线，主动买盘回补，主力洗盘诱空完成".into(),
            ));
        }
    }

    // -------------------------------------------------------------
    // Pattern 4: Microstructure Order Book & Flow (主动抢筹 / 恐慌出逃)
    // -------------------------------------------------------------
    // 主动抢筹：五档买盘积压或主动买盘占比高，多头强力进攻
    if (quote.active_buy_ratio >= 0.65 || (quote.bid_ask_imbalance >= 0.45 && quote.outer_vol > quote.inner_vol * 1.35))
        && price >= benchmark
        && bias_pct >= 0.1
    {
        return Some(make_signal(
            TrendState::AggressiveBuying,
            70,
            format!(
                "买盘五档深度积压（失衡度 {:.0}%），主动买盘占比 {:.0}%，多头主力强力攻坚",
                quote.bid_ask_imbalance * 100.0,
                quote.active_buy_ratio * 100.0
            ),
        ));
    }

    // 恐慌出逃：五档抛压压顶或主动抛盘砸穿买档
    if ((quote.active_buy_ratio <= 0.35 && quote.active_buy_ratio > 0.0) || quote.bid_ask_imbalance <= -0.45)
        && price < benchmark
        && bias_pct <= -0.35
    {
        return Some(make_signal(
            TrendState::PanicDumping,
            -75,
            format!(
                "卖盘五档显著压顶（失衡度 {:.0}%），主动抛压密集砸穿买档，空头恐慌出逃",
                quote.bid_ask_imbalance * 100.0
            ),
        ));
    }

    // -------------------------------------------------------------
    // Pattern 5: Opening Range Breakout (ORB 开盘区间突破)
    // -------------------------------------------------------------
    if latest.time > 945 {
        if let Some(h15) = orb_high {
            if price > h15 && vol_ratio >= 1.25 && bias_pct >= 0.15 {
                return Some(make_signal(
                    TrendState::OrbBreakoutUp,
                    60,
                    format!("放量突破开盘15分钟区间高点 ({h15:.2})，日内多头突破形态确立"),
                ));
            }
        }
        if let Some(l15) = orb_low {
            if price < l15 && vol_ratio >= 1.20 && bias_pct <= -0.15 {
                return Some(make_signal(
                    TrendState::OrbBreakdownDown,
                    -60,
                    format!("跌破开盘15分钟区间低点 ({l15:.2})，日内空头破位下行"),
                ));
            }
        }
    }

    // -------------------------------------------------------------
    // Pattern 6: Volume Surge (放量拉升)
    // -------------------------------------------------------------
    if vol_ratio >= 1.7 && price > benchmark && price >= recent_min_price * 1.002 && slope_pct >= -0.05 {
        let score = (55.0 + (vol_ratio * 10.0).min(30.0)) as i32;
        return Some(make_signal(
            TrendState::VolumeSurge,
            score,
            format!("短线放量异动（量比 {vol_ratio:.1}x），多头买盘推升价格走强"),
        ));
    }

    // -------------------------------------------------------------
    // Pattern 7: Breakdown (放量破位)
    // -------------------------------------------------------------
    if vol_ratio >= 1.5 && price < benchmark && price <= recent_max_price * 0.998 && bias_pct <= -0.3 {
        return Some(make_signal(
            TrendState::Breakdown,
            -70,
            format!("放量跌破分时均线（量比 {vol_ratio:.1}x），短线抛压加剧，形态走弱"),
        ));
    }
    None
}
