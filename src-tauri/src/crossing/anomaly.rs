use std::time::{Duration, Instant};

use crate::config::AnomalyAlertConfig;
use crate::quote::Quote;
use super::types::*;

#[derive(Debug, Clone)]
pub struct QuoteSample {
    pub time: Instant,
    pub price: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BoardState {
    #[default]
    Normal,
    NearLimitUp,
    SealedLimitUp,
    NearLimitDown,
    SealedLimitDown,
}

#[derive(Debug, Clone, Default)]
pub struct SecurityIntradayState {
    pub samples: Vec<QuoteSample>,
    pub session_high: Option<f64>,
    pub alert_high_anchor: Option<f64>,
    pub session_low: Option<f64>,
    pub alert_low_anchor: Option<f64>,
    pub board_state: BoardState,
    pub had_been_sealed_up: bool,
    pub had_been_sealed_down: bool,
    pub peak_seal_vol: f64,
    pub seal_loosening_warned: bool,
    pub initialized: bool,
    pub last_surge_price: Option<f64>,
    pub last_drop_price: Option<f64>,
}

impl SecurityIntradayState {
    pub fn update_quote_anomalies(
        &mut self,
        code: &str,
        quote: &Quote,
        anomaly_cfg: &AnomalyAlertConfig,
        now: Instant,
        mut check_cooldown: impl FnMut(&str, Duration) -> bool,
    ) -> Vec<CrossingEvent> {
        let mut events = Vec::new();

        if !self.initialized {
            self.initialized = true;
            let initial_high = if quote.high > 0.0 { quote.high } else { quote.price };
            let initial_low = if quote.low > 0.0 { quote.low } else { quote.price };
            self.session_high = Some(initial_high);
            self.session_low = Some(initial_low);
            self.alert_high_anchor = Some(initial_high);
            self.alert_low_anchor = Some(initial_low);
            self.samples.push(QuoteSample {
                time: now,
                price: quote.price,
                volume: quote.volume,
            });
            if !(quote.name.starts_with('N') || quote.name.starts_with('C')) {
                self.seed_board_state(quote);
            }
            return events;
        }

        // Add sample and prune samples older than 120 seconds
        self.samples.push(QuoteSample {
            time: now,
            price: quote.price,
            volume: quote.volume,
        });
        self.samples.retain(|s| now.saturating_duration_since(s.time).as_secs() <= 120);

        // 1. 急速拉升与急速跳水
        if anomaly_cfg.rapid_change && self.samples.len() >= 2 {
            let oldest = self.samples.first().unwrap();
            let delta_v = (quote.volume - oldest.volume).max(0.0);
            let dt_secs = now.saturating_duration_since(oldest.time).as_secs().max(5);
            let rate_1min = delta_v / (dt_secs as f64) * 60.0;
            let baseline_avg = (quote.volume / 120.0).max(100.0);
            let has_volume_expansion = delta_v >= 100.0 && rate_1min >= baseline_avg * 1.5;

            let min_p = self.samples.iter().map(|s| s.price).fold(f64::INFINITY, f64::min);
            let max_p = self.samples.iter().map(|s| s.price).fold(0.0, f64::max);
            let prev_tick_price = self.samples[self.samples.len() - 2].price;

            if let Some(prev_p) = self.last_surge_price {
                if quote.price <= prev_p * 0.990 {
                    self.last_surge_price = None;
                }
            }
            if let Some(prev_p) = self.last_drop_price {
                if quote.price >= prev_p * 1.010 {
                    self.last_drop_price = None;
                }
            }

            if has_volume_expansion && min_p > 0.0 {
                let surge_pct = (quote.price - min_p) / min_p * 100.0;
                if surge_pct >= 1.5 && quote.price >= prev_tick_price {
                    let wave_allowed = match self.last_surge_price {
                        None => true,
                        Some(prev_p) => quote.price >= prev_p * 1.008,
                    };
                    if wave_allowed {
                        self.last_surge_price = Some(quote.price);
                        events.push(CrossingEvent::RapidChange {
                            code: code.to_string(),
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
                    let wave_allowed = match self.last_drop_price {
                        None => true,
                        Some(prev_p) => quote.price <= prev_p * 0.992,
                    };
                    if wave_allowed {
                        self.last_drop_price = Some(quote.price);
                        events.push(CrossingEvent::RapidChange {
                            code: code.to_string(),
                            pct_delta: (drop_pct * 100.0).round() / 100.0,
                            is_surge: false,
                            price: quote.price,
                        });
                    }
                }
            }
        }

        // 2. 突破日内新高与跌破日内新低
        if anomaly_cfg.intraday_extremes {
            if quote.price > 0.0 {
                self.session_high = Some(self.session_high.map_or(quote.price, |h| h.max(quote.price)));
                self.session_low = Some(self.session_low.map_or(quote.price, |l| l.min(quote.price)));
            }

            if let Some(anchor) = self.alert_high_anchor {
                let breakout_pct = if anchor > 0.0 {
                    (quote.price - anchor) / anchor * 100.0
                } else {
                    0.0
                };
                if breakout_pct >= 0.8 && quote.change_pct >= 1.5 {
                    let key = format!("{code}:new_high");
                    if check_cooldown(&key, Duration::from_secs(600)) {
                        events.push(CrossingEvent::IntradayExtreme {
                            code: code.to_string(),
                            is_new_high: true,
                            price: quote.price,
                            change_pct: quote.change_pct,
                        });
                    }
                    self.alert_high_anchor = Some(quote.price);
                }
            } else {
                self.alert_high_anchor = Some(quote.price);
            }

            if let Some(anchor) = self.alert_low_anchor {
                let breakdown_pct = if anchor > 0.0 {
                    (anchor - quote.price) / anchor * 100.0
                } else {
                    0.0
                };
                if breakdown_pct >= 0.8 && quote.change_pct <= -1.5 {
                    let key = format!("{code}:new_low");
                    if check_cooldown(&key, Duration::from_secs(600)) {
                        events.push(CrossingEvent::IntradayExtreme {
                            code: code.to_string(),
                            is_new_high: false,
                            price: quote.price,
                            change_pct: quote.change_pct,
                        });
                    }
                    self.alert_low_anchor = Some(quote.price);
                }
            } else {
                self.alert_low_anchor = Some(quote.price);
            }
        }

        // 3. 盘口异动放量
        if anomaly_cfg.volume_burst && self.samples.len() >= 2 {
            if let Some(oldest_sample) = self.samples.iter().find(|s| now.saturating_duration_since(s.time).as_secs() >= 20) {
                let delta_v = quote.volume - oldest_sample.volume;
                let dt_secs = now.saturating_duration_since(oldest_sample.time).as_secs();
                let rate_1min = delta_v / (dt_secs as f64) * 60.0;

                let elapsed = crate::market::elapsed_trading_minutes_from_quote(quote)
                    .unwrap_or_else(|| crate::market::elapsed_trading_minutes(crate::market::beijing_now()));
                let baseline_vol = oldest_sample.volume.max(200.0);
                let baseline_avg = (baseline_vol / elapsed).max(200.0);

                let price_motion = if oldest_sample.price > 0.0 {
                    (quote.price - oldest_sample.price).abs() / oldest_sample.price * 100.0
                } else {
                    0.0
                };

                if delta_v >= 300.0 && rate_1min >= 3.0 * baseline_avg && price_motion >= 0.3 {
                    let mult = (rate_1min / baseline_avg).max(2.0);
                    let is_surge = quote.price >= oldest_sample.price;
                    let key = format!("{code}:vol_burst");
                    if check_cooldown(&key, Duration::from_secs(600)) {
                        events.push(CrossingEvent::VolumeBurst {
                            code: code.to_string(),
                            volume_hands: delta_v,
                            is_surge,
                            delta_pct: (price_motion * 100.0).round() / 100.0,
                            change_pct: quote.change_pct,
                            multiple: (mult * 10.0).round() / 10.0,
                            price: quote.price,
                        });
                    }
                }
            }
        }

        // 4. 精确四层涨跌停状态机
        if anomaly_cfg.limit_board {
            self.detect_limit_board(code, quote, &mut check_cooldown, &mut events);
        }

        events
    }
}
