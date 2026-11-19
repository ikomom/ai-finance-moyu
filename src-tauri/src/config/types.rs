//! Persisted configuration value types.
//!
//! Split from `mod.rs` so the schema and the file I/O each stay readable
//! (and inside the 300-line budget, AGENTS.md §11).

use serde::{Deserialize, Serialize};

use crate::crossing::{PriceLine, WatchSpec};

pub use super::ai::*;
pub use super::groups::*;
pub use super::layout::*;
use super::layout::sizes_are_empty;

/// One security on the watchlist.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchItem {
    /// Canonical prefixed code, e.g. `sh600000`.
    pub code: String,
    /// Cached Chinese security name, e.g. `浦发银行`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Optional entry price, drawn as a 成本线 with a live 浮盈 percentage.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_price: Option<f64>,
    /// Optional number of held shares for calculating monetary PnL.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shares: Option<f64>,
    /// Per-security override of the global 涨跌提醒 threshold.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alert_pct: Option<f64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub price_lines: Vec<PriceLine>,
    /// Per-security indicator strategy override: "inherit" | "ultra_short" | "classic" | "swing" | "custom"
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indicator_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_ma: Option<[u32; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_macd: Option<[u32; 3]>,
    /// Optional assigned watchlist group ID (defaults to "default").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

impl WatchItem {
    pub fn new(code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            name: None,
            cost_price: None,
            shares: None,
            alert_pct: None,
            price_lines: Vec::new(),
            indicator_mode: None,
            custom_ma: None,
            custom_macd: None,
            group: None,
        }
    }

    /// Build the crossing spec, falling back to the global threshold.
    pub fn spec(&self, global_alert_pct: f64) -> WatchSpec {
        WatchSpec {
            code: self.code.clone(),
            alert_pct: self.alert_pct.or(Some(global_alert_pct)),
            price_lines: self.price_lines.clone(),
        }
    }
}

pub use super::prefs::*;
use super::prefs::{default_theme, default_true};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub watchlist: Vec<WatchItem>,
    pub layout: Layout,
    /// Whole-window opacity, 0.2–1.0.
    pub opacity: f64,
    /// Visual theme skin preset: "dark" | "light" | "transparent" | "ocean" | "cyberpunk"
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Default 涨跌提醒 threshold in percent, used when a security sets none.
    pub alert_pct: f64,
    pub poll_quotes_ms: u64,
    pub poll_trend_ms: u64,
    pub notifications: bool,
    pub autostart: bool,
    pub hotkeys: Hotkeys,
    pub data_source: DataSource,
    /// Per-layout sizes the user set by resizing the display window.
    #[serde(default, skip_serializing_if = "sizes_are_empty")]
    pub layout_sizes: LayoutSizes,
    /// Position of the display window, plus the last size (for compatibility
    /// with configs written before per-layout sizes existed).
    pub window: WindowGeom,
    #[serde(default)]
    pub visibility_mode: VisibilityMode,
    /// Local volume-price structure & VWAP analysis.
    #[serde(default = "default_true")]
    pub trend_engine: bool,
    /// Intraday real-time anomaly alerts.
    #[serde(default)]
    pub anomaly_alerts: AnomalyAlertConfig,
    /// Optional iWencai OpenAPI Key for whole-market breadth and analytics.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub iwencai_api_key: Option<String>,
    /// Global indicator strategy configuration (MA & MACD parameters).
    #[serde(default)]
    pub indicator_config: IndicatorConfig,
    /// Jev / Laya (System-1) decision model configuration.
    #[serde(default)]
    pub ai_decision: AiDecisionConfig,
    /// Whether simulated investment and portfolio ledger mode is enabled.
    #[serde(default)]
    pub enable_portfolio: bool,
    /// Watchlist groups.
    #[serde(default = "default_groups")]
    pub groups: Vec<WatchGroup>,
    /// Currently active foreground group ID (None or "all" means all).
    #[serde(default)]
    pub active_group_id: Option<String>,
    /// Custom dragon & tiger seat markings and trader labels.
    #[serde(default = "default_custom_seats_cfg")]
    pub custom_seats: Vec<crate::dragon_tiger::CustomSeatMapping>,
    /// Minute volume bar scaling mode: "linear" (default) | "sqrt".
    #[serde(default)]
    pub volume_scale_mode: VolumeScaleMode,
    /// Schema version for automated lossless data migrations.
    #[serde(default = "default_schema_version", alias = "schema_version")]
    pub schema_version: u32,
}

pub const CONFIG_SCHEMA_VERSION: u32 = 2;

fn default_schema_version() -> u32 {
    CONFIG_SCHEMA_VERSION
}

fn default_custom_seats_cfg() -> Vec<crate::dragon_tiger::CustomSeatMapping> {
    crate::dragon_tiger::default_custom_seats()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            watchlist: vec![
                WatchItem::new("sh000001"), WatchItem::new("sz399001"), WatchItem::new("sz399006"),
                WatchItem::new("sh600000"), WatchItem::new("sz300750"),
            ],
            layout: Layout::default(),
            opacity: 0.92,
            theme: default_theme(),
            alert_pct: 3.0,
            poll_quotes_ms: 3000,
            poll_trend_ms: 30_000,
            notifications: true,
            autostart: false,
            hotkeys: Hotkeys::default(),
            data_source: DataSource::default(),
            layout_sizes: LayoutSizes::default(),
            window: WindowGeom { x: 1400, y: 120, width: 320.0, height: 170.0 },
            visibility_mode: VisibilityMode::default(),
            trend_engine: true,
            anomaly_alerts: AnomalyAlertConfig::default(),
            iwencai_api_key: None,
            indicator_config: IndicatorConfig::default(),
            ai_decision: AiDecisionConfig::default(),
            enable_portfolio: false,
            groups: default_groups(),
            active_group_id: None,
            custom_seats: default_custom_seats_cfg(),
            volume_scale_mode: VolumeScaleMode::default(),
            schema_version: CONFIG_SCHEMA_VERSION,
        }
    }
}

impl Config {
    pub fn codes(&self) -> Vec<String> {
        self.watchlist.iter().map(|w| w.code.clone()).collect()
    }
}

