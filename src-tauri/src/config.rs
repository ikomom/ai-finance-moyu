//! Persistent settings, stored as JSON under the app config dir
//! (`%APPDATA%\ai-finance-moyu\config.json`).
//!
//! Writes go through a temp file + rename so a crash mid-poll can never leave a
//! truncated config behind.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::crossing::{PriceLine, WatchSpec};
use crate::quote::{Quote, Trend};

/// Which of the four layouts the window is showing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Layout {
    /// One line per security — the most discreet.
    Bar,
    /// Name, price and the intraday curve.
    #[default]
    Mini,
    /// Full watchlist with an expandable chart.
    List,
    /// Macro market overview & sector sentiment.
    Market,
    /// Global stock indices & international market trends.
    Global,
}

/// Which upstream quote provider to use.
///
/// Both are public, key-free endpoints that speak GB18030 and accept a comma
/// separated code list, so they differ mainly in field layout and in how the
/// intraday series is shaped. Tencent is the default because its intraday
/// payload already carries cumulative volume/amount, whereas Sina reports them
/// per minute and they have to be accumulated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum DataSource {
    #[default]
    Tencent,
    Sina,
}

impl DataSource {
    pub fn label(self) -> &'static str {
        match self {
            DataSource::Tencent => "腾讯财经",
            DataSource::Sina => "新浪财经",
        }
    }
}

/// How the display window handles visibility and edge docking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum VisibilityMode {
    /// Always visible, never auto-collapses.
    #[default]
    Always,
    /// Auto-collapses to an edge handle when near screen edge; expands on hover.
    Hover,
    /// Auto-collapses to an edge handle; expands on double click; collapses on dblclick or 2s inactivity.
    DblClick,
    /// Controlled purely by Boss Key shortcut and tray.
    Hotkey,
}

impl VisibilityMode {
    pub fn label(self) -> &'static str {
        match self {
            VisibilityMode::Always => "常驻显示",
            VisibilityMode::Hover => "鼠标悬停展开",
            VisibilityMode::DblClick => "双击把手展开",
            VisibilityMode::Hotkey => "仅快捷键控制",
        }
    }
}

/// A display-window size the user set by resizing, per layout.
///
/// `None` means "auto": the layout's natural size, which for the bar layout
/// grows with the watchlist. Once the user drags the window edge, that layout
/// keeps the size they chose.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LayoutSizes {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bar: Option<[f64; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mini: Option<[f64; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list: Option<[f64; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub market: Option<[f64; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global: Option<[f64; 2]>,
}

/// True when no layout has a user-set size, so the whole map can be left out of
/// the config file rather than serializing as an empty object.
fn sizes_are_empty(s: &LayoutSizes) -> bool {
    s.is_empty()
}

impl LayoutSizes {
    pub fn is_empty(&self) -> bool {
        self.bar.is_none()
            && self.mini.is_none()
            && self.list.is_none()
            && self.market.is_none()
            && self.global.is_none()
    }

    pub fn get(&self, layout: Layout) -> Option<(f64, f64)> {
        let v = match layout {
            Layout::Bar => self.bar,
            Layout::Mini => self.mini,
            Layout::List => self.list,
            Layout::Market => self.market,
            Layout::Global => self.global,
        };
        v.map(|[w, h]| (w, h))
    }

    pub fn set(&mut self, layout: Layout, w: f64, h: f64) {
        let v = Some([w, h]);
        match layout {
            Layout::Bar => self.bar = v,
            Layout::Mini => self.mini = v,
            Layout::List => self.list = v,
            Layout::Market => self.market = v,
            Layout::Global => self.global = v,
        }
    }

    /// Drop a remembered size so the layout goes back to auto-sizing.
    pub fn clear(&mut self, layout: Layout) {
        match layout {
            Layout::Bar => self.bar = None,
            Layout::Mini => self.mini = None,
            Layout::List => self.list = None,
            Layout::Market => self.market = None,
            Layout::Global => self.global = None,
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

/// Global shortcut chords, as strings the global-shortcut plugin accepts.
///
/// Deliberately `Ctrl+Alt` rather than `Ctrl+Shift`: on Chinese Windows
/// `Ctrl+Shift` is the IME switch chord, and `Ctrl+Shift+1/2/3` are commonly
/// bound to switching between input methods. Using them would switch the IME as
/// a side effect of changing layout.
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

fn default_true() -> bool {
    true
}

fn default_theme() -> String {
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
                    if w < 140.0 || w > 1400.0 || !w.is_finite() {
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
    }

    pub fn codes(&self) -> Vec<String> {
        self.watchlist.iter().map(|w| w.code.clone()).collect()
    }
}

pub fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录: {e}"))
}

pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("config.json"))
}

/// Load from disk, falling back to defaults. A corrupt file is moved aside
/// rather than deleted, so the user can recover a hand-edited config.
pub fn load(app: &AppHandle) -> Config {
    let Ok(path) = config_path(app) else {
        return Config::default();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Config::default();
    };
    match serde_json::from_str::<Config>(&text) {
        Ok(mut cfg) => {
            cfg.sanitize();
            cfg
        }
        Err(e) => {
            log::error!(target: "SYSTEM", "config.json 解析失败({e})，已备份为 config.json.bak 并回退默认配置");
            let _ = std::fs::rename(&path, path.with_extension("json.bak"));
            Config::default()
        }
    }
}

/// Atomic save: write a sibling temp file, then rename over the target.
/// `std::fs::rename` replaces an existing file on Windows (MOVEFILE_REPLACE_EXISTING).
pub fn save(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| format!("序列化失败: {e}"))?;

    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("写入临时配置失败: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("替换配置文件失败: {e}"))?;
    Ok(())
}

/// Local cache of quotes and trends saved to disk, so opening the app
/// offline or outside market hours still instantly displays the last known data.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuotesCache {
    pub quotes: Vec<Quote>,
    pub trends: HashMap<String, Trend>,
}

pub fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("cache.json"))
}

pub fn load_cache(app: &AppHandle) -> QuotesCache {
    let Ok(path) = cache_path(app) else {
        return QuotesCache::default();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return QuotesCache::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn save_cache(app: &AppHandle, cache: &QuotesCache) {
    if let Ok(path) = cache_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(cache) {
            let tmp = path.with_extension("json.tmp");
            if std::fs::write(&tmp, json).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crossing::LineDirection;

    #[test]
    fn defaults_are_sane() {
        let c = Config::default();
        assert!(!c.watchlist.is_empty());
        assert_eq!(c.layout, Layout::Mini);
        assert!(c.opacity > 0.0 && c.opacity <= 1.0);
        assert!(c.poll_quotes_ms >= 1000);
        assert!(c.poll_trend_ms > c.poll_quotes_ms);
    }

    #[test]
    fn default_codes_are_all_canonically_prefixed() {
        for w in Config::default().watchlist {
            let n = crate::market::normalize_code(&w.code).expect("default code must normalize");
            assert_eq!(n, w.code, "默认自选股必须是规范前缀形式");
        }
    }

    #[test]
    fn round_trips_through_json() {
        let mut c = Config::default();
        c.layout = Layout::List;
        c.watchlist[3].cost_price = Some(9.8);
        c.watchlist[3].alert_pct = Some(5.0);
        c.watchlist[3].price_lines = vec![
            PriceLine { price: 10.5, label: Some("压力".into()), direction: LineDirection::Above },
            PriceLine { price: 9.5, label: None, direction: LineDirection::Below },
        ];

        let json = serde_json::to_string(&c).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(c, back);
    }

    /// The optional fields are omitted from the file when unset, so a
    /// hand-edited config stays readable.
    #[test]
    fn omits_empty_optional_fields() {
        let c = Config::default();
        let json = serde_json::to_string(&c).unwrap();
        assert!(!json.contains("costPrice"));
        assert!(!json.contains("priceLines"));
        // But the required ones are present.
        assert!(json.contains("watchlist"));
        assert!(json.contains("\"layout\""));
    }

    /// A config written by an older version (missing keys) still loads.
    #[test]
    fn missing_keys_fall_back_to_defaults() {
        let partial = r#"{"watchlist":[{"code":"sh600000"}]}"#;
        let c: Config = serde_json::from_str(partial).unwrap();
        assert_eq!(c.watchlist.len(), 1);
        assert_eq!(c.layout, Layout::Mini);
        assert_eq!(c.alert_pct, 3.0);
        assert!(!c.watchlist[0].price_lines.is_empty() == false);
    }

    /// A config written before `hotkeys` existed still loads, and picks up the
    /// IME-safe defaults.
    #[test]
    fn hotkeys_default_when_absent_from_file() {
        let partial = r#"{"watchlist":[{"code":"sh600000"}]}"#;
        let c: Config = serde_json::from_str(partial).unwrap();
        assert_eq!(c.hotkeys, Hotkeys::default());
        assert_eq!(c.hotkeys.toggle, "ctrl+alt+h");
    }

    #[test]
    fn hotkeys_are_overridable_from_the_file() {
        let custom = r#"{"hotkeys":{"toggle":"ctrl+alt+q"}}"#;
        let c: Config = serde_json::from_str(custom).unwrap();
        assert_eq!(c.hotkeys.toggle, "ctrl+alt+q");
        // Unspecified chords fall back rather than becoming empty.
        assert_eq!(c.hotkeys.layout_bar, "ctrl+alt+1");
    }

    #[test]
    fn layout_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&Layout::Bar).unwrap(), "\"bar\"");
        assert_eq!(serde_json::to_string(&Layout::Mini).unwrap(), "\"mini\"");
        assert_eq!(serde_json::to_string(&Layout::List).unwrap(), "\"list\"");
        assert_eq!(serde_json::to_string(&Layout::Market).unwrap(), "\"market\"");
        assert_eq!(serde_json::to_string(&Layout::Global).unwrap(), "\"global\"");
    }

    #[test]
    fn sanitize_clamps_out_of_range_values() {
        let mut c = Config::default();
        c.opacity = 5.0;
        c.alert_pct = 0.0;
        c.poll_quotes_ms = 5;
        c.poll_trend_ms = 1;
        c.window.width = 99999.0;
        c.sanitize();

        assert_eq!(c.opacity, 1.0);
        assert_eq!(c.alert_pct, 0.1);
        assert_eq!(c.poll_quotes_ms, 1000);
        assert_eq!(c.poll_trend_ms, 5000);
        assert_eq!(c.window.width, 1200.0);
    }


    /// Guards the IME decision: no default chord may use Ctrl+Shift, which is
    /// the Chinese IME switch chord on Windows.
    #[test]
    fn default_hotkeys_avoid_the_ime_switch_modifier() {
        let h = Hotkeys::default();
        for chord in [&h.toggle, &h.layout_bar, &h.layout_mini, &h.layout_list, &h.layout_market] {
            let lower = chord.to_ascii_lowercase();
            assert!(lower.contains("ctrl"), "{chord} should use Ctrl");
            assert!(lower.contains("alt"), "{chord} should use Alt");
            assert!(!lower.contains("shift"), "{chord} must not use Ctrl+Shift (IME switch)");
        }
        // And they must not collide with each other.
        let mut all = vec![&h.toggle, &h.layout_bar, &h.layout_mini, &h.layout_list, &h.layout_market];
        let n = all.len();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), n, "default hotkeys must be distinct");
    }


    #[test]
    fn data_source_defaults_to_tencent_and_round_trips() {
        assert_eq!(Config::default().data_source, DataSource::Tencent);
        assert_eq!(serde_json::to_string(&DataSource::Sina).unwrap(), "\"sina\"");
        let back: DataSource = serde_json::from_str("\"sina\"").unwrap();
        assert_eq!(back, DataSource::Sina);
    }

    /// A config file written before data sources existed still loads.
    #[test]
    fn data_source_defaults_when_absent() {
        let c: Config = serde_json::from_str(r#"{"watchlist":[{"code":"sh600000"}]}"#).unwrap();
        assert_eq!(c.data_source, DataSource::Tencent);
    }

    #[test]
    fn layout_sizes_start_empty_and_remember_per_layout() {
        let mut s = LayoutSizes::default();
        assert_eq!(s.get(Layout::Mini), None);

        s.set(Layout::Mini, 400.0, 260.0);
        s.set(Layout::List, 360.0, 500.0);
        assert_eq!(s.get(Layout::Mini), Some((400.0, 260.0)));
        assert_eq!(s.get(Layout::List), Some((360.0, 500.0)));
        // Untouched layouts stay on auto.
        assert_eq!(s.get(Layout::Bar), None);

        s.clear(Layout::Mini);
        assert_eq!(s.get(Layout::Mini), None);
    }

    /// Unset sizes are omitted so the file stays readable.
    #[test]
    fn layout_sizes_omit_unset_entries() {
        let c = Config::default();
        let json = serde_json::to_string(&c).unwrap();
        assert!(!json.contains("layoutSizes"));
    }

    /// A nonsense size from a hand-edited file falls back to auto rather than
    /// producing an unusable window.
    #[test]
    fn sanitize_rejects_bogus_layout_sizes() {
        let mut c = Config::default();
        c.layout_sizes.set(Layout::Mini, 0.0, 0.0);
        c.layout_sizes.set(Layout::List, f64::NAN, 400.0);
        c.layout_sizes.set(Layout::Bar, 500.0, 200.0);
        c.sanitize();

        assert_eq!(c.layout_sizes.get(Layout::Mini), None, "zero size must fall back to auto");
        assert_eq!(c.layout_sizes.get(Layout::List), None, "NaN must fall back to auto");
        assert_eq!(c.layout_sizes.get(Layout::Bar), Some((500.0, 32.0)));
    }

    #[test]
    fn sanitize_clamps_oversized_layout_size() {
        let mut c = Config::default();
        c.layout_sizes.set(Layout::Mini, 99999.0, 99999.0);
        c.sanitize();
        assert_eq!(c.layout_sizes.get(Layout::Mini), None);
    }

    #[test]
    fn per_security_alert_overrides_global() {
        let mut w = WatchItem::new("sh600000");
        assert_eq!(w.spec(3.0).alert_pct, Some(3.0));
        w.alert_pct = Some(7.0);
        assert_eq!(w.spec(3.0).alert_pct, Some(7.0));
    }

    #[test]
    fn visibility_mode_defaults_and_round_trips() {
        assert_eq!(Config::default().visibility_mode, VisibilityMode::Always);
        assert_eq!(serde_json::to_string(&VisibilityMode::Hover).unwrap(), "\"hover\"");
        assert_eq!(serde_json::to_string(&VisibilityMode::DblClick).unwrap(), "\"dblclick\"");
        let back: VisibilityMode = serde_json::from_str("\"dblclick\"").unwrap();
        assert_eq!(back, VisibilityMode::DblClick);
    }

    #[test]
    fn indicator_config_defaults_and_sanitizes() {
        let mut c = Config::default();
        assert_eq!(c.indicator_config.preset, "classic");
        assert_eq!(c.indicator_config.ma, [5, 10, 20]);
        assert_eq!(c.indicator_config.macd, [12, 26, 9]);

        // Hand-edited invalid preset and out-of-range params
        c.indicator_config.preset = "invalid_preset".into();
        c.indicator_config.ma = [0, 999, 10];
        c.watchlist[0].indicator_mode = Some("unknown_mode".into());
        c.watchlist[0].custom_ma = Some([0, 1000, 5]);

        c.sanitize();

        assert_eq!(c.indicator_config.preset, "classic");
        assert_eq!(c.indicator_config.ma, [1, 250, 10]);
        assert_eq!(c.watchlist[0].indicator_mode, None);
        assert_eq!(c.watchlist[0].custom_ma, Some([1, 250, 5]));
    }

    #[test]
    fn theme_defaults_and_round_trips() {
        let mut c = Config::default();
        assert_eq!(c.theme, "dark");

        c.theme = "light".into();
        let json = serde_json::to_string(&c).unwrap();
        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(back.theme, "light");

        // Invalid theme gets sanitized back to dark
        c.theme = "unknown_theme".into();
        c.sanitize();
        assert_eq!(c.theme, "dark");
    }
}
