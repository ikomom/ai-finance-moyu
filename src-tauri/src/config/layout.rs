//! Layout / data-source / visibility enums and per-layout sizes.
//!
//! Split from `types.rs` to stay inside the 300-line budget (AGENTS.md §11).

use serde::{Deserialize, Serialize};

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
pub(super) fn sizes_are_empty(s: &LayoutSizes) -> bool {
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
