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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LimitBoardKind {
    /// 触及/逼近涨停
    NearLimitUp,
    /// 触及/逼近跌停
    NearLimitDown,
    /// 涨停炸板 (打开涨停)
    BrokenLimitUp,
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
    VolumeBurst { code: String, volume_hands: f64, multiple: f64, price: f64 },
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
            CrossingEvent::VolumeBurst { multiple, price, .. } => {
                format!("{name} 💥 盘口异动放量！成交量激增 {multiple:.1} 倍，现价 {price:.2}")
            }
            CrossingEvent::LimitBoard { board_kind, price, change_pct, .. } => {
                match board_kind {
                    LimitBoardKind::NearLimitUp => format!("{name} 🔴 逼近涨停！现价 {price:.2} ({change_pct:+.2}%)"),
                    LimitBoardKind::NearLimitDown => format!("{name} 🟢 逼近跌停！现价 {price:.2} ({change_pct:+.2}%)"),
                    LimitBoardKind::BrokenLimitUp => format!("{name} ⚠️ 涨停炸板！开板回落至 {change_pct:+.2}%，现价 {price:.2}"),
                }
            }
        }
    }
}

#[derive(Debug, Clone)]
struct QuoteSample {
    time: Instant,
    price: f64,
    volume: f64,
}

#[derive(Debug, Clone, Default)]
struct SecurityIntradayState {
    samples: Vec<QuoteSample>,
    session_high: Option<f64>,
    alert_high_anchor: Option<f64>,
    session_low: Option<f64>,
    alert_low_anchor: Option<f64>,
    had_hit_limit_up: bool,
    initialized: bool,
    last_surge_price: Option<f64>,
    last_drop_price: Option<f64>,
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
    ///
    /// `price` is the current price; `pct` is the change against previous close.
    #[allow(dead_code)]
    pub fn update(&mut self, spec: &WatchSpec, price: f64, pct: f64) -> Vec<CrossingEvent> {
        self.update_at(spec, price, pct, Instant::now())
    }

    /// Feed one observation at an explicit timestamp.
    #[allow(dead_code)]
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
                .or_insert_with(|| spec.price_lines.iter().map(|l| price >= l.price).collect());

            // A spec that changed shape (lines added/removed) invalidates the
            // remembered state; reseed rather than mis-index.
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
        quote: &crate::quote::Quote,
        anomaly_cfg: &crate::config::AnomalyAlertConfig,
    ) -> Vec<CrossingEvent> {
        self.update_quote_at(spec, quote, anomaly_cfg, Instant::now())
    }

    pub fn update_quote_at(
        &mut self,
        spec: &WatchSpec,
        quote: &crate::quote::Quote,
        anomaly_cfg: &crate::config::AnomalyAlertConfig,
        now: Instant,
    ) -> Vec<CrossingEvent> {
        // Mute all popups and toast alert notifications for market indices (sh000*, sz399*, bj899*)
        // Only explicitly user-configured PriceLines (if any) are evaluated for indices.
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

        if !state.initialized {
            state.initialized = true;
            let initial_high = if quote.high > 0.0 { quote.high } else { quote.price };
            let initial_low = if quote.low > 0.0 { quote.low } else { quote.price };
            state.session_high = Some(initial_high);
            state.session_low = Some(initial_low);
            state.alert_high_anchor = Some(initial_high);
            state.alert_low_anchor = Some(initial_low);
            state.samples.push(QuoteSample {
                time: now,
                price: quote.price,
                volume: quote.volume,
            });
            let is_gem_or_star = quote.code.starts_with("sz30") || quote.code.starts_with("sh68");
            let is_bse = quote.code.starts_with("bj8") || quote.code.starts_with("bj43") || quote.code.starts_with("bj92");
            let is_st = quote.name.contains("ST");
            let up_limit = if is_bse {
                28.5
            } else if is_gem_or_star {
                19.0
            } else if is_st {
                4.8
            } else {
                9.6
            };
            if quote.change_pct >= up_limit {
                state.had_hit_limit_up = true;
            }
            return events;
        }

        // Add sample and prune samples older than 120 seconds
        state.samples.push(QuoteSample {
            time: now,
            price: quote.price,
            volume: quote.volume,
        });
        state.samples.retain(|s| now.saturating_duration_since(s.time).as_secs() <= 120);

        // 1. 急速拉升与急速跳水 (Rapid surge & drop within 120s: 量价共振，波段式触发无需死板冷却)
        if anomaly_cfg.rapid_change && state.samples.len() >= 2 {
            let oldest = state.samples.first().unwrap();
            let delta_v = (quote.volume - oldest.volume).max(0.0);
            let dt_secs = now.saturating_duration_since(oldest.time).as_secs().max(5);
            let rate_1min = delta_v / (dt_secs as f64) * 60.0;
            let baseline_avg = (quote.volume / 120.0).max(100.0);
            let has_volume_expansion = delta_v >= 100.0 && rate_1min >= baseline_avg * 1.5;

            let min_p = state.samples.iter().map(|s| s.price).fold(f64::INFINITY, f64::min);
            let max_p = state.samples.iter().map(|s| s.price).fold(0.0, f64::max);
            let prev_tick_price = state.samples[state.samples.len() - 2].price;

            // Re-arm wave triggers on significant pullbacks / rebounds
            if let Some(prev_p) = state.last_surge_price {
                if quote.price <= prev_p * 0.990 {
                    state.last_surge_price = None;
                }
            }
            if let Some(prev_p) = state.last_drop_price {
                if quote.price >= prev_p * 1.010 {
                    state.last_drop_price = None;
                }
            }

            if has_volume_expansion && min_p > 0.0 {
                let surge_pct = (quote.price - min_p) / min_p * 100.0;
                if surge_pct >= 1.5 && quote.price >= prev_tick_price {
                    // 波段式防重：同一波同一价位不重复触发；突破新台阶(>= +0.8%)可立即触发新一波
                    let wave_allowed = match state.last_surge_price {
                        None => true,
                        Some(prev_p) => quote.price >= prev_p * 1.008,
                    };
                    if wave_allowed {
                        state.last_surge_price = Some(quote.price);
                        events.push(CrossingEvent::RapidChange {
                            code: spec.code.clone(),
                            pct_delta: (surge_pct * 100.0).round() / 100.0,
                            is_surge: true,
                            price: quote.price,
                        });
                    }
                }
            }

            if has_volume_expansion && max_p > 0.0 {
                let drop_pct = (max_p - quote.price) / max_p * 100.0;
                if drop_pct >= 1.5 && quote.price <= prev_tick_price {
                    // 波段式防重：同一波跳水不重复触发；进一步破位(<= -0.8%)可立即触发新一波
                    let wave_allowed = match state.last_drop_price {
                        None => true,
                        Some(prev_p) => quote.price <= prev_p * 0.992,
                    };
                    if wave_allowed {
                        state.last_drop_price = Some(quote.price);
                        events.push(CrossingEvent::RapidChange {
                            code: spec.code.clone(),
                            pct_delta: (drop_pct * 100.0).round() / 100.0,
                            is_surge: false,
                            price: quote.price,
                        });
                    }
                }
            }
        }

        // 2. 突破日内新高与跌破日内新低 (Intraday new high / low: 突破>=0.8%且涨跌幅明显，独立冷却10分钟)
        if anomaly_cfg.intraday_extremes {
            // Track true session high and low continuously
            if quote.price > 0.0 {
                state.session_high = Some(state.session_high.map_or(quote.price, |h| h.max(quote.price)));
                state.session_low = Some(state.session_low.map_or(quote.price, |l| l.min(quote.price)));
            }

            if let Some(anchor) = state.alert_high_anchor {
                let breakout_pct = if anchor > 0.0 {
                    (quote.price - anchor) / anchor * 100.0
                } else {
                    0.0
                };
                if breakout_pct >= 0.8 && quote.change_pct >= 1.5 {
                    let key = format!("{}:new_high", spec.code);
                    if Self::check_cooldown(&mut self.last_fired, Duration::from_secs(600), &key, now) {
                        events.push(CrossingEvent::IntradayExtreme {
                            code: spec.code.clone(),
                            is_new_high: true,
                            price: quote.price,
                            change_pct: quote.change_pct,
                        });
                    }
                    state.alert_high_anchor = Some(quote.price);
                }
            } else {
                state.alert_high_anchor = Some(quote.price);
            }

            if let Some(anchor) = state.alert_low_anchor {
                let breakdown_pct = if anchor > 0.0 {
                    (anchor - quote.price) / anchor * 100.0
                } else {
                    0.0
                };
                if breakdown_pct >= 0.8 && quote.change_pct <= -1.5 {
                    let key = format!("{}:new_low", spec.code);
                    if Self::check_cooldown(&mut self.last_fired, Duration::from_secs(600), &key, now) {
                        events.push(CrossingEvent::IntradayExtreme {
                            code: spec.code.clone(),
                            is_new_high: false,
                            price: quote.price,
                            change_pct: quote.change_pct,
                        });
                    }
                    state.alert_low_anchor = Some(quote.price);
                }
            } else {
                state.alert_low_anchor = Some(quote.price);
            }
        }

        // 3. 盘口异动放量 (Volume burst: 真实开盘均量基准 + 跨度 >= 20s 过滤秒级扰动 + 价格方向配合)
        if anomaly_cfg.volume_burst && state.samples.len() >= 2 {
            // Find sample from at least 20 seconds ago to avoid extrapolating 3-second tick noise
            if let Some(oldest_sample) = state.samples.iter().find(|s| now.saturating_duration_since(s.time).as_secs() >= 20) {
                let delta_v = quote.volume - oldest_sample.volume;
                let dt_secs = now.saturating_duration_since(oldest_sample.time).as_secs();
                let rate_1min = delta_v / (dt_secs as f64) * 60.0;

                // Real average minute volume: quote.volume / elapsed_minutes
                let local_now = chrono::Local::now().naive_local();
                let elapsed = crate::market::elapsed_trading_minutes(local_now);
                let baseline_avg = (quote.volume / elapsed).max(200.0);

                // Price motion check: price must have at least 0.3% movement to count as a directional volume burst
                let price_motion = if oldest_sample.price > 0.0 {
                    (quote.price - oldest_sample.price).abs() / oldest_sample.price * 100.0
                } else {
                    0.0
                };

                // Substantial volume threshold: delta_v >= 300 hands, rate >= 3x real baseline, and price moved
                if delta_v >= 300.0 && rate_1min >= 3.0 * baseline_avg && price_motion >= 0.3 {
                    let mult = (rate_1min / baseline_avg).max(2.0);
                    let key = format!("{}:vol_burst", spec.code);
                    if Self::check_cooldown(&mut self.last_fired, Duration::from_secs(600), &key, now) {
                        events.push(CrossingEvent::VolumeBurst {
                            code: spec.code.clone(),
                            volume_hands: delta_v,
                            multiple: (mult * 10.0).round() / 10.0,
                            price: quote.price,
                        });
                    }
                }
            }
        }

        // 4. 接近涨跌停与涨停炸板 (Limit board & Broken limit)
        let is_ipo_unrestricted = quote.name.starts_with('N') || quote.name.starts_with('C');
        if anomaly_cfg.limit_board && !is_ipo_unrestricted {
            let is_gem_or_star = quote.code.starts_with("sz30") || quote.code.starts_with("sh68");
            let is_bse = quote.code.starts_with("bj8") || quote.code.starts_with("bj43") || quote.code.starts_with("bj92");
            let is_st = quote.name.contains("ST");
            let up_limit = if is_bse {
                28.5
            } else if is_gem_or_star {
                19.0
            } else if is_st {
                4.8
            } else {
                9.6
            };
            let down_limit = -up_limit;

            if quote.change_pct >= up_limit {
                state.had_hit_limit_up = true;
                let key = format!("{}:limit_up", spec.code);
                if Self::check_cooldown(&mut self.last_fired, Duration::from_secs(300), &key, now) {
                    events.push(CrossingEvent::LimitBoard {
                        code: spec.code.clone(),
                        board_kind: LimitBoardKind::NearLimitUp,
                        price: quote.price,
                        change_pct: quote.change_pct,
                    });
                }
            } else if state.had_hit_limit_up && quote.change_pct < (up_limit - 0.8) {
                state.had_hit_limit_up = false;
                let key = format!("{}:broken_limit_up", spec.code);
                if Self::check_cooldown(&mut self.last_fired, Duration::from_secs(300), &key, now) {
                    events.push(CrossingEvent::LimitBoard {
                        code: spec.code.clone(),
                        board_kind: LimitBoardKind::BrokenLimitUp,
                        price: quote.price,
                        change_pct: quote.change_pct,
                    });
                }
            }

            if quote.change_pct <= down_limit {
                let key = format!("{}:limit_down", spec.code);
                if Self::check_cooldown(&mut self.last_fired, Duration::from_secs(300), &key, now) {
                    events.push(CrossingEvent::LimitBoard {
                        code: spec.code.clone(),
                        board_kind: LimitBoardKind::NearLimitDown,
                        price: quote.price,
                        change_pct: quote.change_pct,
                    });
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
        self.intraday_states.retain(|k, _| keep.contains(k));
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

    fn mock_quote(code: &str, price: f64, pct: f64, volume: f64) -> crate::quote::Quote {
        crate::quote::Quote {
            code: code.to_string(),
            name: "测试股票".to_string(),
            price,
            pre_close: 10.0,
            open: 10.0,
            high: price,
            low: price,
            volume,
            change: price - 10.0,
            change_pct: pct,
            date: "20261012".to_string(),
            time: "10:00:00".to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn detects_rapid_surge_and_drop() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        // Initial tick - records state, does not fire
        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        assert!(t.update_quote_at(&s, &q0, &cfg, t0).is_empty());

        // Price rises by 2.0% in 10 seconds -> fires rapid surge!
        let q1 = mock_quote("sh600000", 10.20, 2.0, 1200.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(evs.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })));

        // Price drops by 2.0% in 20 seconds -> fires rapid drop!
        let q2 = mock_quote("sh600000", 9.99, -0.1, 1500.0);
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(30));
        assert!(evs2.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: false, .. })));
    }

    #[test]
    fn detects_new_intraday_high_and_low() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        // Price breaks new high
        let q1 = mock_quote("sh600000", 10.5, 5.0, 1500.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));
        assert!(evs.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })));

        // Price drops to new low
        let q2 = mock_quote("sh600000", 9.5, -5.0, 2000.0);
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(10));
        assert!(evs2.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: false, .. })));
    }

    #[test]
    fn detects_limit_up_and_broken_board() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        // Limit up at +9.8% -> fires near limit up
        let q1 = mock_quote("sh600000", 10.98, 9.8, 5000.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));
        assert!(evs.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::NearLimitUp, .. })));

        // Falls back to +8.5% -> fires broken limit up (炸板)
        let q2 = mock_quote("sh600000", 10.85, 8.5, 6000.0);
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(10));
        assert!(evs2.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::BrokenLimitUp, .. })));
    }

    #[test]
    fn index_symbols_produce_no_anomaly_alerts() {
        let mut t = CrossingTracker::without_cooldown();
        let s = WatchSpec { code: "sh000001".into(), alert_pct: Some(1.0), price_lines: vec![] };
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh000001", 3300.0, 0.0, 10000.0);
        assert!(t.update_quote_at(&s, &q0, &cfg, t0).is_empty());

        // Huge surge on index -> must still be completely muted!
        let q1 = mock_quote("sh000001", 3400.0, 3.03, 20000.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(evs.is_empty(), "Index quotes must never produce anomaly popups");
    }

    #[test]
    fn new_high_requires_0_8_pct_breakout_and_filters_micro_movements() {
        let mut t = CrossingTracker::new(); // default cooldown
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        // Seed with high at 10.0
        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        // Price rises by 1 cent (10.01 = +0.1% breakout, change_pct 0.1%) -> micro movement, NO new high alert!
        let q1 = mock_quote("sh600000", 10.01, 0.1, 1005.0);
        let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));
        assert!(!evs1.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })), "1 cent micro-movement should NOT fire new high");

        // Price breaks out by +2.0% (10.20 >= 10.0 * 1.008, change_pct 2.0% >= 1.5%) -> FIRES!
        let q2 = mock_quote("sh600000", 10.20, 2.0, 1500.0);
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(10));
        assert!(evs2.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })));

        // Price rises another 0.8% at t = 30s (< 600s cooldown) -> suppressed by 10-minute cooldown!
        let q3 = mock_quote("sh600000", 10.30, 3.0, 1800.0);
        let evs3 = t.update_quote_at(&s, &q3, &cfg, t0 + Duration::from_secs(30));
        assert!(!evs3.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })), "Subsequent breakout within 10 minutes should be suppressed");
    }

    #[test]
    fn price_lines_initialized_individually_and_not_copied_from_first_line() {
        let mut t = CrossingTracker::without_cooldown();
        // Line 0 is at 5.0 (direction Below). Line 1 is at 15.0 (direction Below).
        // Current price is 10.0.
        // Previously, slot[1] was incorrectly set to `10.0 >= 5.0` (true)!
        // If price moves to 12.0, slot[1] is still below 15.0. It should NOT fire!
        let s = spec(
            None,
            vec![line(5.0, LineDirection::Below), line(15.0, LineDirection::Below)],
        );
        // Seed tracker with initial price 10.0.
        // Line 0: 10.0 >= 5.0 (above)
        // Line 1: 10.0 < 15.0 (below)
        assert!(t.update(&s, 10.0, 0.0).is_empty());

        // Price rises to 12.0.
        // Line 1 is still below 15.0 (was below, now below). Should NOT fire!
        assert!(t.update(&s, 12.0, 0.0).is_empty());

        // Price falls from 16.0 to 14.0 -> Line 1 crosses below 15.0 -> fires!
        t.update(&s, 16.0, 0.0);
        let evs = t.update(&s, 14.0, 0.0);
        assert_eq!(evs.len(), 1);
        assert!(matches!(evs[0], CrossingEvent::PriceLine { price: 14.0, .. }));
    }

    #[test]
    fn rapid_surge_pullback_does_not_fire_on_falling_ticks() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        // Seed at 10.00
        let q0 = mock_quote("sh600000", 10.00, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        // Surges to 10.20 (+2.0%) with volume -> fires rapid surge!
        let q1 = mock_quote("sh600000", 10.20, 2.0, 1500.0);
        let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(evs1.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })));

        // Price falls back to 10.08 (-1.2% pullback from 10.20 peak).
        // Falling tick must NEVER fire a surge alert!
        let q2 = mock_quote("sh600000", 10.08, 0.8, 1600.0);
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(20));
        assert!(
            !evs2.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })),
            "Pullback on falling tick must NOT fire rapid surge!"
        );
    }

    #[test]
    fn index_with_explicit_price_line_alerts_properly() {
        let mut t = CrossingTracker::without_cooldown();
        let s = WatchSpec {
            code: "sh000001".into(),
            alert_pct: Some(1.0), // alert_pct is ignored for indices
            price_lines: vec![line(3300.0, LineDirection::Above)],
        };
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        // Seed below 3300
        let q0 = mock_quote("sh000001", 3250.0, 0.0, 10000.0);
        assert!(t.update_quote_at(&s, &q0, &cfg, t0).is_empty());

        // Crosses above 3300 -> explicit price line fires!
        let q1 = mock_quote("sh000001", 3310.0, 1.8, 20000.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert_eq!(evs.len(), 1);
        assert!(matches!(evs[0], CrossingEvent::PriceLine { price: 3310.0, .. }));
    }

    #[test]
    fn ipo_unrestricted_stocks_skip_limit_board_alerts() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let mut q0 = mock_quote("sz301600", 20.0, 0.0, 1000.0);
        q0.name = "N强达".to_string(); // Day 1 IPO stock
        t.update_quote_at(&s, &q0, &cfg, t0);

        // Stock climbs +35% (unrestricted)
        let mut q1 = mock_quote("sz301600", 27.0, 35.0, 5000.0);
        q1.name = "N强达".to_string();
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(
            !evs.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { .. })),
            "IPO stock should not trigger limit board alerts"
        );
    }
}

