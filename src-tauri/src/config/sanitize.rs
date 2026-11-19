//! Configuration value sanitization and range clamping.
//!
//! Split from `types.rs` to observe AGENTS.md §11 (<300 lines limit).

use super::layout::Layout;
use super::types::{Config, CONFIG_SCHEMA_VERSION};
use super::groups::{WatchGroup, ALL_GROUP_ID, DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME, default_groups};

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

        if !matches!(self.theme.as_str(), "dark" | "light" | "transparent" | "ocean" | "cyberpunk") {
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

        if self.schema_version == 0 {
            self.schema_version = CONFIG_SCHEMA_VERSION;
        }
    }
}
