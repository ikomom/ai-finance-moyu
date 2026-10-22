use std::time::Duration;
use serde::{Deserialize, Serialize};

/// Default anti-spam cooldown duration (5 minutes) for notifications on the same security & event.
pub const DEFAULT_COOLDOWN: Duration = Duration::from_secs(300);

/// Which side of a threshold a value is on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Band {
    Below,
    /// Within the band — the armed/neutral state.
    In,
    Above,
}

/// Classify `pct` against a symmetric threshold band `[-threshold, +threshold]`.
pub fn band_of(pct: f64, threshold: f64) -> Band {
    if pct > threshold {
        Band::Above
    } else if pct < -threshold {
        Band::Below
    } else {
        Band::In
    }
}

/// Calculate the hysteresis margin (Schmitt trigger buffer) for a threshold.
///
/// For threshold = 3.0%, this gives 0.45%.
/// A stock must pull back below 2.55% before re-arming to `Band::In`.
pub fn hysteresis_margin(threshold: f64) -> f64 {
    let raw = threshold.abs() * 0.15;
    raw.max(0.3).min(threshold.abs() * 0.5)
}

/// Calculate the next band given the previous band and current percentage,
/// applying hysteresis so prices hovering near the boundary do not oscillate.
pub fn next_band(prev: Band, pct: f64, threshold: f64) -> Band {
    let h = hysteresis_margin(threshold);
    match prev {
        Band::In => {
            if pct > threshold {
                Band::Above
            } else if pct < -threshold {
                Band::Below
            } else {
                Band::In
            }
        }
        Band::Above => {
            if pct < -threshold {
                Band::Below
            } else if pct < threshold - h {
                Band::In
            } else {
                Band::Above
            }
        }
        Band::Below => {
            if pct > threshold {
                Band::Above
            } else if pct > -threshold + h {
                Band::In
            } else {
                Band::Below
            }
        }
    }
}

/// Which way a price line should fire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LineDirection {
    /// Fire when price rises above the line.
    Above,
    /// Fire when price falls below the line.
    Below,
}

/// A user-drawn horizontal level on the intraday chart.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceLine {
    pub price: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub direction: LineDirection,
}

/// Per-security thresholds to evaluate.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchSpec {
    pub code: String,
    /// Absolute percent threshold, e.g. `3.0` for ±3%. `None` disables the alert.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alert_pct: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub price_lines: Vec<PriceLine>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LimitBoardKind {
    /// 触及/逼近涨停 (盘口接近涨停但尚未封死)
    NearLimitUp,
    /// 封死涨停 (卖一吃空，买一封单)
    SealedLimitUp { seal_hands: f64 },
    /// 涨停封单松动 (买一封单较峰值骤降 >= 60%，炸板前兆)
    SealLoosening { peak_hands: f64, current_hands: f64, drop_pct: f64 },
    /// 涨停炸板 (曾封死涨停，后被大单砸开)
    BrokenLimitUp,
    /// 触及/逼近跌停
    NearLimitDown,
    /// 封死跌停 (买一吃空，卖一封单)
    SealedLimitDown { seal_hands: f64 },
    /// 跌停撬板 (曾封死跌停，后被大资金撬开反弹)
    BrokenLimitDown,
}

/// Something that just crossed a threshold or triggered an anomaly.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CrossingEvent {
    /// `change_pct` left the neutral band.
    #[serde(rename_all = "camelCase")]
    AlertPct { code: String, pct: f64, side: Band, threshold: f64 },
    /// Price crossed a user price line in the line's firing direction.
    #[serde(rename_all = "camelCase")]
    PriceLine { code: String, line: PriceLine, price: f64 },
    /// 急速拉升或急速跳水
    #[serde(rename_all = "camelCase")]
    RapidChange { code: String, pct_delta: f64, is_surge: bool, price: f64 },
    /// 突破日内新高或跌破日内新低
    #[serde(rename_all = "camelCase")]
    IntradayExtreme { code: String, is_new_high: bool, price: f64, change_pct: f64 },
    /// 盘口短时间异动放量
    #[serde(rename_all = "camelCase")]
    VolumeBurst {
        code: String,
        volume_hands: f64,
        is_surge: bool,
        delta_pct: f64,
        change_pct: f64,
        multiple: f64,
        price: f64,
    },
    /// 接近涨跌停或涨停炸板
    #[serde(rename_all = "camelCase")]
    LimitBoard { code: String, board_kind: LimitBoardKind, price: f64, change_pct: f64 },
}

impl CrossingEvent {
    pub fn code(&self) -> &str {
        match self {
            CrossingEvent::AlertPct { code, .. } => code,
            CrossingEvent::PriceLine { code, .. } => code,
            CrossingEvent::RapidChange { code, .. } => code,
            CrossingEvent::IntradayExtreme { code, .. } => code,
            CrossingEvent::VolumeBurst { code, .. } => code,
            CrossingEvent::LimitBoard { code, .. } => code,
        }
    }

    /// Extract the associated price if available.
    pub fn price(&self) -> Option<f64> {
        match self {
            CrossingEvent::RapidChange { price, .. } => Some(*price),
            CrossingEvent::IntradayExtreme { price, .. } => Some(*price),
            CrossingEvent::VolumeBurst { price, .. } => Some(*price),
            CrossingEvent::LimitBoard { price, .. } => Some(*price),
            CrossingEvent::PriceLine { price, .. } => Some(*price),
            CrossingEvent::AlertPct { .. } => None,
        }
    }

    /// Compact badge text for multi-anomaly composite alerts.
    pub fn badge(&self) -> String {
        match self {
            CrossingEvent::AlertPct { pct, threshold, .. } => {
                format!("突破±{threshold:.1}%({pct:+.2}%)")
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
            CrossingEvent::AlertPct { pct, threshold, .. } => {
                format!("{name} 涨跌幅 {pct:+.2}%，已突破 ±{threshold:.1}%")
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
