//! Intraday downward price attribution analysis: diagnosing why a security is dropping.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

use serde::{Deserialize, Serialize};
use crate::quote::Quote;

/// Qualitative attribution of intraday downward price movement.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FallAttribution {
    /// Identifier: "broken_limit_up" | "panic_dumping" | "breakdown" | "sector_drag" | "illiquid_drift"
    pub code: String,
    /// User-facing short badge label: e.g. "⚡ 涨停炸板", "🚨 主力砸盘"
    pub tag: String,
    /// Plain-language diagnostic reasoning
    pub reason: String,
    /// Actionable tactical guidance
    pub guidance: String,
    /// Visual severity level: "danger" | "warn" | "neutral"
    pub severity: String,
}

/// Evaluate downward attribution for a security based on tape, VWAP, ORB, and sector linkage.
pub fn evaluate_fall_attribution(
    quote: &Quote,
    orb_low: Option<f64>,
    bias_pct: f64,
    sector_linkage: Option<&crate::market_overview::SectorLinkage>,
) -> Option<FallAttribution> {
    // 1. Broken Limit Up (⚡ 涨停炸板派发): reached near limit up and then collapsed
    if quote.pre_close > 0.0 && quote.high >= quote.pre_close * 1.092 && quote.price < quote.high {
        let drop_from_high = (quote.high - quote.price) / quote.high;
        if drop_from_high >= 0.025 {
            return Some(FallAttribution {
                code: "broken_limit_up".to_string(),
                tag: "⚡ 涨停炸板".to_string(),
                reason: "早盘冲击涨停封板未遂，遭遇巨量大单开板砸盘，筹码剧烈松动".to_string(),
                guidance: "谨防高位天地针回落，逢反抽果断减仓控险，严禁盲目博回封".to_string(),
                severity: "danger".to_string(),
            });
        }
    }

    // Only diagnose downward attribution if the stock is negative on the day
    if quote.change_pct >= 0.0 {
        return None;
    }

    // 2. Independent Dump / Panic Selling (🚨 独立主力砸盘): negative delta to sector and heavy active selling
    let is_sector_lagging = sector_linkage.map(|s| s.delta_r_sector <= -1.5).unwrap_or(true);
    let heavy_active_selling = quote.active_buy_ratio > 0.0 && quote.active_buy_ratio <= 0.42;
    let heavy_ask_pressure = quote.bid_ask_imbalance <= -0.15;

    if quote.change_pct <= -1.2 && is_sector_lagging && (heavy_active_selling || heavy_ask_pressure) {
        let delta_text = sector_linkage
            .map(|s| format!("（落后板块 {:+.1}%）", s.delta_r_sector))
            .unwrap_or_default();
        return Some(FallAttribution {
            code: "panic_dumping".to_string(),
            tag: "🚨 主力砸盘".to_string(),
            reason: format!("脱离板块与大盘独立下杀{delta_text}，内盘卖单坚决砸盘，资金抢跑出逃"),
            guidance: "主力资金单边净流出，空头压盘坚决，严禁盲目伸手接飞刀".to_string(),
            severity: "danger".to_string(),
        });
    }

    // 3. Technical Breakdown (❄️ 关键支撑破位): broke below ORB low and VWAP
    if quote.change_pct <= -0.8 && bias_pct <= -0.8 {
        if let Some(low) = orb_low {
            if quote.price < low {
                return Some(FallAttribution {
                    code: "breakdown".to_string(),
                    tag: "❄️ 支撑破位".to_string(),
                    reason: format!("放量跌穿早盘箱体下沿 ({low:.2}) 且均线失守，触发日内程序化止损盘"),
                    guidance: "早盘筹码全部套牢，短线防御为主，等待放量企稳信号".to_string(),
                    severity: "warn".to_string(),
                });
            }
        }
    }

    // 4. Sector Drag (🛡️ 板块退潮拖累): sector dropped heavily but stock is resilient or synchronous
    if let Some(sec) = sector_linkage {
        if (sec.sector_change_pct <= -1.5 || sec.delta_r_market <= -1.0) && sec.delta_r_sector >= -1.0 {
            return Some(FallAttribution {
                code: "sector_drag".to_string(),
                tag: "🛡️ 板块拖累".to_string(),
                reason: format!(
                    "所属{}板块重挫 ({:+.1}%)，个股跌幅强于/贴近板块，属板块情绪退潮波及",
                    sec.sector_name, sec.sector_change_pct
                ),
                guidance: "非个股主力恶性砸盘，无需恐慌割肉，密切观察所属板块龙头能否止跌企稳".to_string(),
                severity: "neutral".to_string(),
            });
        }
    }

    // 5. Illiquid Drift (● 缩量阴跌): mild negative drift below VWAP
    if quote.change_pct <= -0.3 && bias_pct <= -0.2 {
        return Some(FallAttribution {
            code: "illiquid_drift".to_string(),
            tag: "● 缩量阴跌".to_string(),
            reason: "交投清淡买盘乏力，分时紧贴均线下方无序阴跌，市场关注度偏低".to_string(),
            guidance: "多看少动，缺乏主力资金关注，避免频繁操作震荡磨损".to_string(),
            severity: "neutral".to_string(),
        });
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_quote(price: f64, pre_close: f64, high: f64, low: f64) -> Quote {
        let change = price - pre_close;
        let change_pct = if pre_close > 0.0 { change / pre_close * 100.0 } else { 0.0 };
        Quote {
            code: "sz002242".into(),
            name: "九阳股份".into(),
            price,
            change,
            change_pct,
            volume: 100000.0,
            open: pre_close,
            pre_close,
            high,
            low,
            date: "20261123".into(),
            time: "10:30:00".into(),
            active_buy_ratio: 0.5,
            bid_ask_imbalance: 0.0,
            ..Default::default()
        }
    }

    #[test]
    fn test_broken_limit_up() {
        let q = dummy_quote(10.5, 10.0, 11.0, 10.0); // pre_close 10, high 11 (+10%), now 10.5 (+5%)
        let attr = evaluate_fall_attribution(&q, None, 0.0, None).unwrap();
        assert_eq!(attr.code, "broken_limit_up");
        assert_eq!(attr.severity, "danger");
    }

    #[test]
    fn test_panic_dumping() {
        let mut q = dummy_quote(9.6, 10.0, 10.0, 9.5); // -4%
        q.active_buy_ratio = 0.35; // 65% selling
        let sec = crate::market_overview::SectorLinkage {
            sector_code: "s1".into(),
            sector_name: "家电".into(),
            sector_change_pct: -0.5,
            delta_r_sector: -3.5,
            delta_r_market: -3.0,
            leader_code: "".into(),
            leader_name: "".into(),
            leader_change_pct: 0.0,
            role: "".into(),
            diagnosis: "".into(),
            sectors: vec![],
        };
        let attr = evaluate_fall_attribution(&q, None, -2.0, Some(&sec)).unwrap();
        assert_eq!(attr.code, "panic_dumping");
        assert_eq!(attr.severity, "danger");
    }

    #[test]
    fn test_breakdown() {
        let q = dummy_quote(9.7, 10.0, 10.0, 9.6); // -3%
        let attr = evaluate_fall_attribution(&q, Some(9.85), -1.5, None).unwrap();
        assert_eq!(attr.code, "breakdown");
        assert_eq!(attr.severity, "warn");
    }

    #[test]
    fn test_sector_drag() {
        let q = dummy_quote(9.8, 10.0, 10.0, 9.7); // -2%
        let sec = crate::market_overview::SectorLinkage {
            sector_code: "s1".into(),
            sector_name: "小家电".into(),
            sector_change_pct: -2.8,
            delta_r_sector: 0.8, // Stock fell less than sector!
            delta_r_market: -1.5,
            leader_code: "".into(),
            leader_name: "".into(),
            leader_change_pct: 0.0,
            role: "".into(),
            diagnosis: "".into(),
            sectors: vec![],
        };
        let attr = evaluate_fall_attribution(&q, None, -0.5, Some(&sec)).unwrap();
        assert_eq!(attr.code, "sector_drag");
        assert_eq!(attr.severity, "neutral");
    }

    #[test]
    fn test_rising_stock_returns_none() {
        let q = dummy_quote(10.3, 10.0, 10.4, 10.0); // +3%
        let attr = evaluate_fall_attribution(&q, None, 1.0, None);
        assert!(attr.is_none());
    }
}
