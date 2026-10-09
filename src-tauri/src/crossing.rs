//! Edge-triggered threshold detection.
//!
//! Cost lines, 涨跌提醒 and 自定义价位线 are all the same mechanism: watch a
//! price, notice when it crosses a threshold, act once. The thing that matters
//! is that they are **edge**-triggered, not level-triggered.
//!
//! Quotes poll every few seconds. If we fired an alert whenever
//! `change_pct > 3.0`, a stock sitting at +3.2% would fire every single poll
//! until it moved — hundreds of notifications for one crossing. So we track the
//! previous side of each threshold and only emit on a transition, re-arming
//! once the price returns to the neutral band.
//!
//! The very first observation of a security only records state; it never fires,
//! so starting the app while a stock is already up 5% doesn't instantly spam.

use std::collections::HashMap;
use std::time::{Duration, Instant};

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

/// Something that just crossed a threshold.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CrossingEvent {
    /// `change_pct` left the neutral band.
    #[serde(rename_all = "camelCase")]
    AlertPct { code: String, pct: f64, side: Band, threshold: f64 },
    /// Price crossed a user price line in the line's firing direction.
    #[serde(rename_all = "camelCase")]
    PriceLine { code: String, line: PriceLine, price: f64 },
}

impl CrossingEvent {
    pub fn code(&self) -> &str {
        match self {
            CrossingEvent::AlertPct { code, .. } => code,
            CrossingEvent::PriceLine { code, .. } => code,
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
        }
    }
}

/// Remembers where each security sat relative to its thresholds last tick.
#[derive(Debug)]
pub struct CrossingTracker {
    pct_band: HashMap<String, Band>,
    /// Whether the price was above each line, indexed positionally.
    line_above: HashMap<String, Vec<bool>>,
    /// Timestamp of the last time an alert event was triggered for a key.
    last_fired: HashMap<String, Instant>,
    /// Anti-spam cooldown duration. Repeated alerts for the same event key within this window are throttled.
    cooldown: Duration,
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
            cooldown,
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
    ///
    /// `price` is the current price; `pct` is the change against previous close.
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
                // First observation just records state.
                None => {}
                Some(prev) => {
                    // Fire on any transition into an extreme. In -> Above and
                    // Below -> Above both count; Above -> In is a silent re-arm.
                    if prev != new_band && new_band != Band::In {
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
                }
            }
        }

        // --- 自定义价位线 ---
        if !spec.price_lines.is_empty() {
            let slot = self
                .line_above
                .entry(spec.code.clone())
                .or_insert_with(|| vec![price >= spec.price_lines[0].price; spec.price_lines.len()]);

            // A spec that changed shape (lines added/removed) invalidates the
            // remembered state; reseed rather than mis-index.
            if slot.len() != spec.price_lines.len() {
                *slot = spec.price_lines.iter().map(|l| price >= l.price).collect();
                return events;
            }

            for (i, line) in spec.price_lines.iter().enumerate() {
                let now_above = price >= line.price;
                let was_above = slot[i];
                slot[i] = now_above;

                if now_above == was_above {
                    continue;
                }
                let fired = match line.direction {
                    LineDirection::Above => now_above,
                    LineDirection::Below => !now_above,
                };
                if fired {
                    let key = format!("{}:line:{}:{:?}", spec.code, i, line.direction);
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

    /// Drop remembered state for codes no longer watched, so removed-then-
    /// re-added securities re-arm from scratch.
    pub fn retain(&mut self, keep: &[String]) {
        self.pct_band.retain(|k, _| keep.contains(k));
        self.line_above.retain(|k, _| keep.contains(k));
        self.last_fired.retain(|k, _| {
            k.split_once(':')
                .map(|(code, _)| keep.iter().any(|c| c == code))
                .unwrap_or(false)
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(pct: Option<f64>, lines: Vec<PriceLine>) -> WatchSpec {
        WatchSpec { code: "sh600000".into(), alert_pct: pct, price_lines: lines }
    }

    fn line(price: f64, direction: LineDirection) -> PriceLine {
        PriceLine { price, label: None, direction }
    }

    #[test]
    fn band_classification() {
        assert_eq!(band_of(0.0, 3.0), Band::In);
        assert_eq!(band_of(3.0, 3.0), Band::In); // boundary is inside
        assert_eq!(band_of(3.01, 3.0), Band::Above);
        assert_eq!(band_of(-3.0, 3.0), Band::In);
        assert_eq!(band_of(-3.01, 3.0), Band::Below);
    }

    /// The core anti-spam guarantee: a stock parked above the threshold fires
    /// exactly once, no matter how many polls land while it sits there.
    #[test]
    fn level_above_threshold_fires_once_not_every_tick() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);

        // First observation only records state — no fire.
        assert!(t.update(&s, 100.0, 3.5).is_empty());

        // Still above: no repeated alerts.
        for _ in 0..5 {
            assert!(t.update(&s, 100.0, 3.6).is_empty());
        }
    }

    #[test]
    fn fires_on_upward_break_from_inside_band() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);

        assert!(t.update(&s, 100.0, 1.0).is_empty());
        let ev = t.update(&s, 100.0, 3.2);
        assert_eq!(ev.len(), 1);
        assert!(matches!(
            ev[0],
            CrossingEvent::AlertPct { side: Band::Above, .. }
        ));
    }

    #[test]
    fn fires_on_downward_break() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);

        t.update(&s, 100.0, 0.0);
        let ev = t.update(&s, 100.0, -4.0);
        assert_eq!(ev.len(), 1);
        assert!(matches!(
            ev[0],
            CrossingEvent::AlertPct { side: Band::Below, .. }
        ));
    }

    /// Returning to the band must re-arm so a second excursion alerts again.
    #[test]
    fn rearms_after_returning_to_band() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(Some(3.0), vec![]);

        t.update(&s, 100.0, 0.0); // In
        assert_eq!(t.update(&s, 100.0, 3.5).len(), 1); // -> Above, fires
        assert!(t.update(&s, 100.0, 1.0).is_empty()); // -> In, silent re-arm (< 2.55%)
        assert_eq!(t.update(&s, 100.0, 3.5).len(), 1); // -> Above, fires again
    }

    /// A gap straight through the band still alerts once, on the new side.
    #[test]
    fn fires_once_when_jumping_across_band() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);

        t.update(&s, 100.0, -5.0); // Below
        let ev = t.update(&s, 100.0, 5.0); // Below -> Above
        assert_eq!(ev.len(), 1);
        assert!(matches!(ev[0], CrossingEvent::AlertPct { side: Band::Above, .. }));
    }

    #[test]
    fn no_alert_spec_produces_no_events() {
        let mut t = CrossingTracker::new();
        let s = spec(None, vec![]);
        assert!(t.update(&s, 100.0, 50.0).is_empty());
        assert!(t.update(&s, 100.0, 60.0).is_empty());
    }

    #[test]
    fn price_line_fires_only_crossing_its_direction() {
        let mut t = CrossingTracker::new();
        let s = spec(None, vec![line(10.5, LineDirection::Above)]);

        t.update(&s, 10.40, 0.0); // seeded below
        assert!(t.update(&s, 10.45, 0.0).is_empty()); // still below
        assert_eq!(t.update(&s, 10.55, 0.0).len(), 1); // crossed above -> fire
        assert!(t.update(&s, 10.60, 0.0).is_empty()); // still above -> no repeat
    }

    #[test]
    fn below_direction_line_is_silent_when_price_rises_through_it() {
        let mut t = CrossingTracker::new();
        let s = spec(None, vec![line(9.5, LineDirection::Below)]);

        t.update(&s, 9.40, 0.0); // below
        // Rising above the line is the *wrong* direction for this line.
        assert!(t.update(&s, 9.60, 0.0).is_empty());
        // Falling back below it is the firing direction.
        assert_eq!(t.update(&s, 9.40, 0.0).len(), 1);
    }

    #[test]
    fn multiple_lines_fire_independently() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(
            None,
            vec![line(10.5, LineDirection::Above), line(9.5, LineDirection::Below)],
        );
        t.update(&s, 10.0, 0.0);

        let up = t.update(&s, 10.6, 0.0);
        assert_eq!(up.len(), 1);
        let down = t.update(&s, 9.4, 0.0);
        assert_eq!(down.len(), 1);
        // Both lines crossed in one jump.
        let both = t.update(&s, 10.6, 0.0);
        assert_eq!(both.len(), 1); // down-line re-crosses; up-line is silent
    }

    /// Changing the line set must not misalign remembered state.
    #[test]
    fn changing_line_count_reseeds_without_firing() {
        let mut t = CrossingTracker::new();
        let one = spec(None, vec![line(10.5, LineDirection::Above)]);
        t.update(&one, 10.4, 0.0);

        let two = spec(
            None,
            vec![line(10.5, LineDirection::Above), line(9.5, LineDirection::Below)],
        );
        assert!(t.update(&two, 11.0, 0.0).is_empty());

        let one_again = spec(None, vec![line(10.5, LineDirection::Above)]);
        assert!(t.update(&one_again, 11.0, 0.0).is_empty());
    }

    #[test]
    fn retain_forgets_removed_codes() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);
        t.update(&s, 100.0, 0.0);
        assert_eq!(t.update(&s, 100.0, 3.5).len(), 1);

        t.retain(&[]);
        // After being forgotten, the next observation only seeds again.
        assert!(t.update(&s, 100.0, 4.0).is_empty());
    }

    #[test]
    fn hysteresis_band_transitions() {
        // Threshold = 3.0%, margin = 0.45%. Exit threshold = 2.55%
        assert_eq!(next_band(Band::In, 3.01, 3.0), Band::Above);
        assert_eq!(next_band(Band::In, -3.01, 3.0), Band::Below);
        assert_eq!(next_band(Band::In, 2.99, 3.0), Band::In);

        // From Above: hovering at boundary stays Above, does NOT drop to In
        assert_eq!(next_band(Band::Above, 3.13, 3.0), Band::Above);
        assert_eq!(next_band(Band::Above, 2.99, 3.0), Band::Above);
        assert_eq!(next_band(Band::Above, 2.60, 3.0), Band::Above);
        // Only drops to In below 3.0 - 0.45 = 2.55%
        assert_eq!(next_band(Band::Above, 2.54, 3.0), Band::In);

        // From Below: hovering at boundary stays Below
        assert_eq!(next_band(Band::Below, -3.13, 3.0), Band::Below);
        assert_eq!(next_band(Band::Below, -2.99, 3.0), Band::Below);
        assert_eq!(next_band(Band::Below, -2.60, 3.0), Band::Below);
        // Only drops to In above -3.0 + 0.45 = -2.55%
        assert_eq!(next_band(Band::Below, -2.54, 3.0), Band::In);
    }

    /// Real-world jitter test: prices oscillating around ±3% by 1 tick (0.01 RMB)
    /// must NEVER fire repeated notifications.
    #[test]
    fn jitter_around_threshold_does_not_fire_repeatedly() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(Some(3.0), vec![]);

        // Seeded at neutral 0.0%
        t.update(&s, 10.0, 0.0);

        // Breaks threshold at +3.13% -> fires once!
        let ev = t.update(&s, 10.0, 3.13);
        assert_eq!(ev.len(), 1);

        // Price jitters around 3.0% (e.g. 2.99%, 3.13%, 2.95%, 3.08%, 2.70%, 3.12%):
        let jitter = [2.99, 3.13, 2.95, 3.08, 3.00, 2.85, 3.14, 2.75, 3.05];
        for &pct in &jitter {
            assert!(
                t.update(&s, 10.0, pct).is_empty(),
                "Jitter at {pct}% should not trigger notification",
            );
        }

        // Only after substantial pullback (< 2.55%) does it re-arm to In:
        assert!(t.update(&s, 10.0, 2.40).is_empty());

        // And only then does another break fire:
        assert_eq!(t.update(&s, 10.0, 3.20).len(), 1);
    }

    /// Cooldown throttle test: repeated breakouts within 5 minutes are throttled.
    #[test]
    fn cooldown_suppresses_rapid_rearm_firing() {
        let mut t = CrossingTracker::new(); // default 300s cooldown
        let s = spec(Some(3.0), vec![]);
        let t0 = Instant::now();

        // Seed
        t.update_at(&s, 10.0, 0.0, t0);

        // First breakout at t0 -> fires!
        assert_eq!(t.update_at(&s, 10.0, 3.5, t0).len(), 1);

        // Pullback at t = 10s (re-arms to Band::In)
        assert!(t.update_at(&s, 10.0, 1.0, t0 + Duration::from_secs(10)).is_empty());

        // Second breakout at t = 30s (< 300s cooldown) -> suppressed by cooldown!
        assert!(t.update_at(&s, 10.0, 3.5, t0 + Duration::from_secs(30)).is_empty());

        // Price pulls back again at t = 290s (re-arms to Band::In)
        assert!(t.update_at(&s, 10.0, 1.0, t0 + Duration::from_secs(290)).is_empty());

        // Third breakout after 5 minutes (t = 305s > 300s) -> fires!
        assert_eq!(t.update_at(&s, 10.0, 3.5, t0 + Duration::from_secs(305)).len(), 1);
    }
}
