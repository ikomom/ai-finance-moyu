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
}

impl Default for Config {
    fn default() -> Self {
        Self {
            watchlist: vec![
                WatchItem::new("sh000001"),
                WatchItem::new("sz399001"),
                WatchItem::new("sz399006"),
                WatchItem::new("sh600000"),
                WatchItem::new("sz300750"),
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
        }
    }
}

impl Config {
    /// Clamp values a hand-edited file could have put out of range.
    pub fn sanitize(&mut self) {
        if let Some(key) = &mut self.iwencai_api_key {
            let trimmed = key.trim();
            if trimmed.is_empty() {
                self.iwencai_api_key = None;
            } else {
                *key = trimmed.to_string();
            }
        }

        if !matches!(
            self.theme.as_str(),
            "dark" | "light" | "transparent" | "ocean" | "cyberpunk"
        ) {
            self.theme = "dark".into();
        }

        self.opacity = self.opacity.clamp(0.2, 1.0);
        self.alert_pct = self.alert_pct.clamp(0.1, 50.0);
        // Never poll faster than 1s; that would just get us rate-limited.
        self.poll_quotes_ms = self.poll_quotes_ms.clamp(1000, 60_000);
        self.poll_trend_ms = self.poll_trend_ms.clamp(5_000, 600_000);
        self.window.width = self.window.width.clamp(180.0, 1200.0);
        self.window.height = self.window.height.clamp(28.0, 1200.0);

        // A hand-edited, snapped or corrupted size must not make the widget unusable.
        for layout in [Layout::Bar, Layout::Mini, Layout::List, Layout::Market, Layout::Global] {
            if let Some((w, h)) = self.layout_sizes.get(layout) {
                if layout == Layout::Bar {
                    if !(140.0..=1400.0).contains(&w) || !w.is_finite() {
                        self.layout_sizes.clear(Layout::Bar);
                    } else {
                        // Bar is strictly a 32px horizontal pill; fix any legacy heights.
                        self.layout_sizes.set(Layout::Bar, w.clamp(180.0, 1400.0), 32.0);
                    }
                    continue;
                }
                let (max_w, max_h) = match layout {
                    Layout::Bar => (1400.0, 32.0),
                    Layout::Mini => (1200.0, 900.0),
                    Layout::List => (1400.0, 1200.0),
                    Layout::Market => (1200.0, 900.0),
                    Layout::Global => (1200.0, 900.0),
                };
                if !w.is_finite() || !h.is_finite() || w < 140.0 || h < 24.0 || w > max_w || h > max_h {
                    self.layout_sizes.clear(layout);
                } else {
                    self.layout_sizes.set(layout, w, h);
                }
            }
        }

        if self.ai_decision.local_port < 1024 {
            self.ai_decision.local_port = 9999;
        }

        // Indicator config sanitization
        if !matches!(
            self.indicator_config.preset.as_str(),
            "ultra_short" | "classic" | "swing" | "custom"
        ) {
            self.indicator_config.preset = "classic".into();
        }
        for v in &mut self.indicator_config.ma {
            *v = (*v).clamp(1, 250);
        }
        for v in &mut self.indicator_config.macd {
            *v = (*v).clamp(1, 250);
        }

        // Per-item indicator mode sanitization
        for item in &mut self.watchlist {
            if let Some(mode) = &item.indicator_mode {
                if !matches!(
                    mode.as_str(),
                    "inherit" | "ultra_short" | "classic" | "swing" | "custom"
                ) {
                    item.indicator_mode = None;
                }
            }
            if let Some(ma) = &mut item.custom_ma {
                for v in ma {
                    *v = (*v).clamp(1, 250);
                }
            }
            if let Some(macd) = &mut item.custom_macd {
                for v in macd {
                    *v = (*v).clamp(1, 250);
                }
            }
        }

        // Watchlist groups sanitization
        if self.groups.is_empty() {
            self.groups = default_groups();
        }
        if !self.groups.iter().any(|g| g.id == DEFAULT_GROUP_ID) {
            self.groups.insert(0, WatchGroup::new(DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME));
        }
        for item in &mut self.watchlist {
            if let Some(grp) = &item.group {
                if !self.groups.iter().any(|g| g.id == *grp) {
                    item.group = Some(DEFAULT_GROUP_ID.to_string());
                }
            } else {
                item.group = Some(DEFAULT_GROUP_ID.to_string());
            }
        }
        if let Some(act) = &self.active_group_id {
            if act != ALL_GROUP_ID && !self.groups.iter().any(|g| g.id == *act) {
                self.active_group_id = None;
            }
        }
    }

    pub fn codes(&self) -> Vec<String> {
        self.watchlist.iter().map(|w| w.code.clone()).collect()
    }
}
