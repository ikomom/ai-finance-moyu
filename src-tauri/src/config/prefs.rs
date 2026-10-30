//! Hotkeys, window geometry and anomaly-alert switches.
//!
//! Split from `types.rs` to stay inside the 300-line budget (AGENTS.md §11).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Hotkeys {
    /// Show/hide — the 老板键.
    pub toggle: String,
    pub layout_bar: String,
    pub layout_mini: String,
    pub layout_list: String,
    pub layout_market: String,
    pub layout_global: String,
}

impl Default for Hotkeys {
    fn default() -> Self {
        Self {
            toggle: "ctrl+alt+h".into(),
            layout_bar: "ctrl+alt+1".into(),
            layout_mini: "ctrl+alt+2".into(),
            layout_list: "ctrl+alt+3".into(),
            layout_market: "ctrl+alt+4".into(),
            layout_global: "ctrl+alt+5".into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowGeom {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

pub(super) fn default_true() -> bool {
    true
}

pub(super) fn default_theme() -> String {
    "dark".to_string()
}

/// Configurable switches for intraday real-time anomaly alerts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AnomalyAlertConfig {
    /// 急速拉升与急速跳水 (短线 1~2 分钟涨跌速突破)
    pub rapid_change: bool,
    /// 突破日内新高与跌破日内新低
    pub intraday_extremes: bool,
    /// 盘口异动放量
    pub volume_burst: bool,
    /// 接近涨跌停与涨停炸板
    pub limit_board: bool,
}

impl Default for AnomalyAlertConfig {
    fn default() -> Self {
        Self {
            rapid_change: true,
            intraday_extremes: true,
            volume_burst: true,
            limit_board: true,
        }
    }
}

/// Indicator strategy configuration (MA periods & MACD parameters).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndicatorConfig {
    /// Strategy preset: "ultra_short" | "classic" | "swing" | "custom"
    pub preset: String,
    /// Moving average periods, e.g. [5, 10, 20] or [3, 5, 10]
    pub ma: [u32; 3],
    /// MACD parameters: [fast, slow, signal], e.g. [12, 26, 9] or [6, 13, 5]
    pub macd: [u32; 3],
}

impl Default for IndicatorConfig {
    fn default() -> Self {
        Self {
            preset: "classic".into(),
            ma: [5, 10, 20],
            macd: [12, 26, 9],
        }
    }
}
