//! The intraday volume-price/VWAP scoring pass.
//!
//! Split from `mod.rs` to stay inside the 300-line budget (AGENTS.md §11).

use crate::quote::{Quote, Trend, TrendPoint};

use super::limit_board::detect_limit_board_pattern;
use super::patterns::{early_patterns, PatternCtx};
use super::types::{now_epoch_secs, TrendSignal, TrendState};

/// Analyze a security's real-time quote and intraday minute trend.
pub fn analyze_trend(
    quote: &Quote,
    trend: Option<&Trend>,
    sector_linkage: Option<crate::market_overview::SectorLinkage>,
) -> Option<TrendSignal> {
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
                orb_high: None,
                orb_low: None,
                sector_linkage,
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
    let is_index = crate::market::is_index(&quote.code) || latest.avg_price <= 0.0;
    let sector_linkage = if crate::market::is_index(&quote.code) { None } else { sector_linkage };
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
    // Smooth the 09:30 opening auction spike at index 0 to avoid distorting baseline moving averages
    if minute_volumes.len() >= 2 && minute_volumes[1] > 0.0 && minute_volumes[0] > minute_volumes[1] * 3.0 {
        minute_volumes[0] = minute_volumes[1] * 2.0;
    }

    // Dynamic volume ratio: compare recent 4 minutes to a rolling 20-minute local baseline.
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

    // Opening Range Breakout (ORB) 15-minute boundary (09:30 - 09:45)
    let (orb_high, orb_low) = {
        let orb_pts: Vec<&TrendPoint> = points.iter().take_while(|p| p.time <= 945).collect();
        if orb_pts.len() >= 3 {
            let high = orb_pts.iter().map(|p| p.price).fold(f64::NEG_INFINITY, f64::max);
            let low = orb_pts.iter().map(|p| p.price).fold(f64::INFINITY, f64::min);
            if high > 0.0 && low > 0.0 && high > low {
                (Some(high), Some(low))
            } else {
                (None, None)
            }
        } else {
            (None, None)
        }
    };

    let make_signal = |state: TrendState, score: i32, summary: String| {
        TrendSignal {
            state,
            label: state.label().into(),
            compact_label: state.compact_label().into(),
            score,
            bias_pct: rounded_bias,
            summary,
            updated_at: now,
            orb_high,
            orb_low,
            sector_linkage: sector_linkage.clone(),
        }
    };


    let ctx = PatternCtx {
        quote,
        points,
        len,
        latest,
        price,
        benchmark,
        bias_pct,
        slope_pct,
        vol_ratio,
        recent_min_price,
        recent_max_price,
        minute_volumes: &minute_volumes,
        orb_high,
        orb_low,
    };
    // 0. Highest priority: Limit Board States (封死跌停 / 封死涨停 / 跌停翘板 / 涨停炸板)
    if let Some(signal) = detect_limit_board_pattern(quote, price, &make_signal) {
        return Some(signal);
    }

    if let Some(signal) = early_patterns(&ctx, &make_signal) {
        return Some(signal);
    }


    // -------------------------------------------------------------
    // Pattern 8: Sector Linkage Divergence (逆势抗跌 / 独立下杀)
    // -------------------------------------------------------------
    if let Some(ref sec) = sector_linkage {
        if sec.role == "逆势抗跌核心" && price >= benchmark {
            return Some(make_signal(
                TrendState::IndependentAlpha,
                65,
                sec.diagnosis.clone(),
            ));
        }
        if sec.role == "脱离板块补跌" && price < benchmark && bias_pct <= -0.3 {
            return Some(make_signal(
                TrendState::SoloPlunge,
                -65,
                sec.diagnosis.clone(),
            ));
        }
    }

    // -------------------------------------------------------------
    // Pattern 9: Breakout Pullback (突破回踩企稳)
    // -------------------------------------------------------------
    let tested_vwap_support = recent_min_price <= benchmark * 1.003 && recent_min_price >= benchmark * 0.995;
    if price >= benchmark && bias_pct <= 0.85 && tested_vwap_support && price > recent_min_price && slope_pct >= -0.03 && vol_ratio < 1.35 {
        return Some(make_signal(
            TrendState::BreakoutPullback,
            70,
            "回踩分时均线企稳不破，量能收缩，均线支撑强劲".into(),
        ));
    }

    // -------------------------------------------------------------
    // Pattern 10: VWAP Resistance (反抽承压)
    // -------------------------------------------------------------
    let tested_vwap_resistance = recent_max_price >= benchmark * 0.996 && recent_max_price <= benchmark * 1.005;
    if price < benchmark && bias_pct >= -1.2 && tested_vwap_resistance && price < recent_max_price && slope_pct <= 0.05 {
        return Some(make_signal(
            TrendState::VwapResistance,
            -50,
            "反抽分时均线受阻遇压，未能有效站上，均线反压明显".into(),
        ));
    }

    // -------------------------------------------------------------
    // Pattern 11: Illiquid Drift (缩量阴跌)
    // -------------------------------------------------------------
    if vol_ratio <= 0.65 && (-2.0..=-0.15).contains(&bias_pct) && price < benchmark && slope_pct <= 0.01 {
        return Some(make_signal(
            TrendState::IlliquidDrift,
            -40,
            format!("紧贴分时均线下方持续走弱，量能萎缩（量比 {vol_ratio:.1}x），缺乏买盘承接，呈缩量阴跌"),
        ));
    }

    // -------------------------------------------------------------
    // Pattern 12: Steady Bull (稳步多头)
    // -------------------------------------------------------------
    if price > benchmark && (0.25..=2.2).contains(&bias_pct) && slope_pct >= 0.07 && vol_ratio >= 0.75 {
        return Some(make_signal(
            TrendState::SteadyBull,
            45,
            "均线呈多头仰角上行，价格依托均线稳步推升".into(),
        ));
    }

    // -------------------------------------------------------------
    // Pattern 13: Consolidation (窄幅整理)
    // -------------------------------------------------------------
    let range_pct = (recent_max_price - recent_min_price) / benchmark * 100.0;
    if bias_pct.abs() <= 0.35 && range_pct < 0.65 && vol_ratio <= 1.25 {
        return Some(make_signal(
            TrendState::Consolidation,
            0,
            "价格贴合均价线窄幅纠缠，量能平稳，处于蓄势整理阶段".into(),
        ));
    }

    // -------------------------------------------------------------
    // Pattern 14: General Neutral / Balanced
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
        orb_high,
        orb_low,
        sector_linkage,
    })
}
