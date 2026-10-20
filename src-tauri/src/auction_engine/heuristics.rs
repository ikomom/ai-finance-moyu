//! Heuristic evaluation of the morning call-auction tape.
//!
//! Split from `mod.rs` to stay inside the 300-line budget (AGENTS.md §11).

use super::types::*;


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
    let significant_vol_drop = vol_drop.is_some_and(|d| d >= 30.0);
    let significant_buy_cancel = unmatched_buy_drop.is_some_and(|d| d >= 50.0);

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
    let significant_sell_cancel = unmatched_sell_drop.is_some_and(|d| d >= 50.0);
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

