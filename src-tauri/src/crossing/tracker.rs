use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::config::AnomalyAlertConfig;
use crate::quote::Quote;
use super::anomaly::SecurityIntradayState;
use super::types::*;

/// Remembers where each security sat relative to its thresholds last tick.
#[derive(Debug)]
pub struct CrossingTracker {
    pct_band: HashMap<String, Band>,
    /// Whether the price was above each line, indexed positionally.
    line_above: HashMap<String, Vec<bool>>,
    /// Timestamp of the last time an alert event was triggered for a key.
    last_fired: HashMap<String, Instant>,
    /// Timestamp of the last time a desktop notification was fired for a code.
    desktop_notif_fired: HashMap<String, Instant>,
    /// Anti-spam cooldown duration. Repeated alerts for the same event key within this window are throttled.
    cooldown: Duration,
    intraday_states: HashMap<String, SecurityIntradayState>,
}

impl Default for CrossingTracker {
    fn default() -> Self {
        Self::new()
    }
}

impl CrossingTracker {
    pub fn new() -> Self {
        Self::with_cooldown(DEFAULT_COOLDOWN)
    }

    /// Tracker instance with cooldown disabled (useful for deterministic unit tests).
    #[allow(dead_code)]
    pub fn without_cooldown() -> Self {
        Self::with_cooldown(Duration::ZERO)
    }

    pub fn with_cooldown(cooldown: Duration) -> Self {
        Self {
            pct_band: HashMap::new(),
            line_above: HashMap::new(),
            last_fired: HashMap::new(),
            desktop_notif_fired: HashMap::new(),
            cooldown,
            intraday_states: HashMap::new(),
        }
    }

    #[allow(dead_code)]
    pub fn set_cooldown(&mut self, cooldown: Duration) {
        self.cooldown = cooldown;
    }

    fn check_cooldown(
        last_fired: &mut HashMap<String, Instant>,
        cooldown: Duration,
        key: &str,
        now: Instant,
    ) -> bool {
        if cooldown.is_zero() {
            return true;
        }
        if let Some(&last) = last_fired.get(key) {
            if now.saturating_duration_since(last) < cooldown {
                return false;
            }
        }
        last_fired.insert(key.to_string(), now);
        true
    }

    /// Feed one observation. Returns whatever crossed *on this tick*, which is
    /// usually nothing.
    #[allow(dead_code)]
    pub fn update(&mut self, spec: &WatchSpec, price: f64, pct: f64) -> Vec<CrossingEvent> {
        self.update_at(spec, price, pct, Instant::now())
    }

    /// Feed one observation at an explicit timestamp.
    pub fn update_at(
        &mut self,
        spec: &WatchSpec,
        price: f64,
        pct: f64,
        now: Instant,
    ) -> Vec<CrossingEvent> {
        let mut events = Vec::new();

        // --- 涨跌提醒: symmetric percent band with hysteresis ---
        if let Some(threshold) = spec.alert_pct {
            let prev_band = self.pct_band.get(&spec.code).copied();
            let new_band = match prev_band {
                None => band_of(pct, threshold),
                Some(prev) => next_band(prev, pct, threshold),
            };
            self.pct_band.insert(spec.code.clone(), new_band);

            match prev_band {
                Some(prev) if prev != new_band && new_band != Band::In => {
                    let key = format!("{}:pct:{:?}", spec.code, new_band);
                    if Self::check_cooldown(&mut self.last_fired, self.cooldown, &key, now) {
                        events.push(CrossingEvent::AlertPct {
                            code: spec.code.clone(),
                            pct,
                            side: new_band,
                            threshold,
                        });
                    }
                }
                _ => {}
            }
        }

        // --- 自定义价位线 ---
        if !spec.price_lines.is_empty() {
            let slot = self
                .line_above
                .entry(spec.code.clone())
                .or_insert_with(|| spec.price_lines.iter().map(|l| price >= l.price).collect());

            if slot.len() != spec.price_lines.len() {
                *slot = spec.price_lines.iter().map(|l| price >= l.price).collect();
                return events;
            }

            for (_i, line) in spec.price_lines.iter().enumerate() {
                let now_above = price >= line.price;
                let was_above = slot[_i];
                slot[_i] = now_above;

                if now_above == was_above {
                    continue;
                }
                let fired = match line.direction {
                    LineDirection::Above => now_above,
                    LineDirection::Below => !now_above,
                };
                if fired {
                    let key = format!("{}:line:{:.2}:{:?}", spec.code, line.price, line.direction);
                    if Self::check_cooldown(&mut self.last_fired, self.cooldown, &key, now) {
                        events.push(CrossingEvent::PriceLine {
                            code: spec.code.clone(),
                            line: line.clone(),
                            price,
                        });
                    }
                }
            }
        }

        events
    }

    /// Update quote with price line / pct band checks AND intraday anomaly detection.
    pub fn update_quote(
        &mut self,
        spec: &WatchSpec,
        quote: &Quote,
        anomaly_cfg: &AnomalyAlertConfig,
    ) -> Vec<CrossingEvent> {
        self.update_quote_at(spec, quote, anomaly_cfg, Instant::now())
    }

    pub fn update_quote_at(
        &mut self,
        spec: &WatchSpec,
        quote: &Quote,
        anomaly_cfg: &AnomalyAlertConfig,
        now: Instant,
    ) -> Vec<CrossingEvent> {
        if crate::auction_engine::is_index_symbol(&quote.code) {
            if spec.price_lines.is_empty() || quote.price <= 0.0 {
                return Vec::new();
            }
            let dummy_spec = WatchSpec {
                code: spec.code.clone(),
                alert_pct: None,
                price_lines: spec.price_lines.clone(),
            };
            return self.update_at(&dummy_spec, quote.price, quote.change_pct, now);
        }

        let mut events = self.update_at(spec, quote.price, quote.change_pct, now);

        if quote.price <= 0.0 {
            return events;
        }

        let state = self.intraday_states.entry(spec.code.clone()).or_default();
        let last_fired = &mut self.last_fired;
        let cooldown = self.cooldown;

        let anomaly_events = state.update_quote_anomalies(
            &spec.code,
            quote,
            anomaly_cfg,
            now,
            |key, cd| {
                let actual_cd = if cooldown.is_zero() { Duration::ZERO } else { cd };
                Self::check_cooldown(last_fired, actual_cd, key, now)
            },
        );

        events.extend(anomaly_events);
        events
    }

    /// Check whether a desktop system notification is allowed for this security.
    /// Rate-limited to at most 1 desktop notification per security per 60 seconds.
    pub fn allow_desktop_notification(&mut self, code: &str, now: Instant) -> bool {
        if self.cooldown.is_zero() {
            return true;
        }
        const DESKTOP_COOLDOWN: Duration = Duration::from_secs(60);
        if let Some(&last) = self.desktop_notif_fired.get(code) {
            if now.saturating_duration_since(last) < DESKTOP_COOLDOWN {
                return false;
            }
        }
        self.desktop_notif_fired.insert(code.to_string(), now);
        true
    }

    /// Drop remembered state for codes no longer watched, so removed-then-
    /// re-added securities re-arm from scratch.
    pub fn retain(&mut self, keep: &[String]) {
        self.pct_band.retain(|k, _| keep.contains(k));
        self.line_above.retain(|k, _| keep.contains(k));
        self.desktop_notif_fired.retain(|k, _| keep.contains(k));
        self.intraday_states.retain(|k, _| keep.contains(k));
        self.last_fired.retain(|k, _| {
            k.split_once(':')
                .map(|(code, _)| keep.iter().any(|c| c == code))
                .unwrap_or(false)
        });
    }
}
