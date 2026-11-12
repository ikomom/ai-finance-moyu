//! Formatting logic for CrossingEvent badges and human-readable messages.

use super::types::{Band, CrossingEvent, LimitBoardKind, LineDirection};

impl CrossingEvent {
    /// Compact badge text for multi-anomaly composite alerts.
    pub fn badge(&self) -> String {
        match self {
            CrossingEvent::AlertPct { pct, threshold, side, is_pullback, .. } => {
                match side {
                    Band::Above => {
                        if *is_pullback {
                            format!("⚠️回落+{threshold:.1}%({pct:+.2}%)")
                        } else {
                            format!("📈突破+{threshold:.1}%({pct:+.2}%)")
                        }
                    }
                    Band::Below => {
                        if *is_pullback {
                            format!("反弹-{threshold:.1}%({pct:+.2}%)")
                        } else {
                            format!("📉跌破-{threshold:.1}%({pct:+.2}%)")
                        }
                    }
                    Band::In => format!("区间±{threshold:.1}%({pct:+.2}%)"),
                }
            }
            CrossingEvent::PriceLine { line, price, .. } => {
                let dir = match line.direction {
                    LineDirection::Above => "上穿",
                    LineDirection::Below => "下穿",
                };
                let label = line.label.as_deref().unwrap_or("价位线");
                format!("{dir}{label}({price:.2})")
            }
            CrossingEvent::RapidChange { pct_delta, is_surge, .. } => {
                if *is_surge {
                    format!("🚀急速拉升(+{pct_delta:.2}%)")
                } else {
                    format!("⚡急速跳水(-{pct_delta:.2}%)")
                }
            }
            CrossingEvent::IntradayExtreme { is_new_high, .. } => {
                if *is_new_high {
                    "📈创日内新高".to_string()
                } else {
                    "📉创日内新低".to_string()
                }
            }
            CrossingEvent::VolumeBurst { is_surge, multiple, .. } => {
                if *is_surge {
                    format!("💥盘口扫盘({multiple:.1}x)")
                } else {
                    format!("💥盘口砸盘({multiple:.1}x)")
                }
            }
            CrossingEvent::LimitBoard { board_kind, .. } => {
                match board_kind {
                    LimitBoardKind::NearLimitUp => "🔴逼近涨停".to_string(),
                    LimitBoardKind::SealedLimitUp { .. } => "🔒封死涨停".to_string(),
                    LimitBoardKind::SealLoosening { drop_pct, .. } => format!("⚡封单骤降(-{drop_pct:.0}%)"),
                    LimitBoardKind::BrokenLimitUp => "⚠️涨停炸板".to_string(),
                    LimitBoardKind::NearLimitDown => "🟢逼近跌停".to_string(),
                    LimitBoardKind::SealedLimitDown { .. } => "🔒封死跌停".to_string(),
                    LimitBoardKind::BrokenLimitDown => "🚀跌停翘板".to_string(),
                }
            }
        }
    }

    /// Human-readable line for a system notification.
    pub fn message(&self, name: &str) -> String {
        match self {
            CrossingEvent::AlertPct { pct, threshold, side, is_pullback, tier, .. } => {
                match side {
                    Band::Above => {
                        if *is_pullback {
                            format!("{name} ⚠️ 从高位回落至 +{threshold:.1}%（现涨 {pct:+.2}%）")
                        } else if *tier >= 3 {
                            format!("{name} 🔥 爆量大涨突破 +{threshold:.1}%！现涨 {pct:+.2}%")
                        } else if *tier == 2 {
                            format!("{name} 🚀 强势冲破 +{threshold:.1}%！现涨 {pct:+.2}%")
                        } else {
                            format!("{name} 📈 向上突破 +{threshold:.1}%！现涨 {pct:+.2}%")
                        }
                    }
                    Band::Below => {
                        if *is_pullback {
                            format!("{name} 探底反弹回升至 -{threshold:.1}%（现跌 {pct:+.2}%）")
                        } else if *tier >= 3 {
                            format!("{name} 💥 深度下挫跌破 -{threshold:.1}%！现跌 {pct:+.2}%")
                        } else if *tier == 2 {
                            format!("{name} ⚡ 加速下挫跌破 -{threshold:.1}%！现跌 {pct:+.2}%")
                        } else {
                            format!("{name} 📉 向下跌破 -{threshold:.1}%！现跌 {pct:+.2}%")
                        }
                    }
                    Band::In => format!("{name} 涨跌幅 {pct:+.2}%，已回到 ±{threshold:.1}% 区间内"),
                }
            }
            CrossingEvent::PriceLine { line, price, .. } => {
                let label = line.label.as_deref().unwrap_or("价位线");
                let dir = match line.direction {
                    LineDirection::Above => "上穿",
                    LineDirection::Below => "下穿",
                };
                format!("{name} 现价 {price:.2}，{dir} {label} {:.2}", line.price)
            }
            CrossingEvent::RapidChange { pct_delta, is_surge, price, .. } => {
                if *is_surge {
                    format!("{name} 🚀 急速拉升！短线拉升 +{pct_delta:.2}%，现价 {price:.2}")
                } else {
                    format!("{name} ⚡ 急速跳水！短线快速下挫 -{pct_delta:.2}%，现价 {price:.2}")
                }
            }
            CrossingEvent::IntradayExtreme { is_new_high, price, change_pct, .. } => {
                if *is_new_high {
                    format!("{name} 📈 突破日内新高！现价 {price:.2} ({change_pct:+.2}%)")
                } else {
                    format!("{name} 📉 跌破日内新低！现价 {price:.2} ({change_pct:+.2}%)")
                }
            }
            CrossingEvent::VolumeBurst {
                is_surge,
                delta_pct,
                change_pct,
                multiple,
                price,
                ..
            } => {
                if *is_surge {
                    format!(
                        "{name} 💥 盘口主买扫盘！放量推升 +{delta_pct:.2}% (日内 {change_pct:+.2}%)，成交激增 {multiple:.1}x，现价 {price:.2}"
                    )
                } else {
                    format!(
                        "{name} 💥 盘口主卖砸盘！放量打压 -{delta_pct:.2}% (日内 {change_pct:+.2}%)，成交激增 {multiple:.1}x，现价 {price:.2}"
                    )
                }
            }
            CrossingEvent::LimitBoard { board_kind, price, change_pct, .. } => {
                match board_kind {
                    LimitBoardKind::NearLimitUp => format!("{name} 🔴 逼近涨停！现价 {price:.2} ({change_pct:+.2}%)"),
                    LimitBoardKind::SealedLimitUp { seal_hands } => {
                        format!("{name} 🔒 封死涨停！封单 {seal_hands:.0} 手，现价 {price:.2} ({change_pct:+.2}%)")
                    }
                    LimitBoardKind::SealLoosening { peak_hands, current_hands, drop_pct } => {
                        format!("{name} ⚡ 涨停封单骤降！从 {peak_hands:.0} 手降至 {current_hands:.0} 手 (-{drop_pct:.0}%)，谨防开板！")
                    }
                    LimitBoardKind::BrokenLimitUp => format!("{name} ⚠️ 涨停炸板！开板回落至 {change_pct:+.2}%，现价 {price:.2}"),
                    LimitBoardKind::NearLimitDown => format!("{name} 🟢 逼近跌停！现价 {price:.2} ({change_pct:+.2}%)"),
                    LimitBoardKind::SealedLimitDown { seal_hands } => {
                        format!("{name} 🔒 封死跌停！封单 {seal_hands:.0} 手，现价 {price:.2} ({change_pct:+.2}%)")
                    }
                    LimitBoardKind::BrokenLimitDown => format!("{name} 🚀 跌停翘板！开板回升至 {change_pct:+.2}%，现价 {price:.2}"),
                }
            }
        }
    }
}
