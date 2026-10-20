//! Tests for `mod` (tests).
//!
//! Kept out of the implementation file so every source file stays inside
//! the 300-line budget mandated by AGENTS.md §11.

    use std::time::{Duration, Instant};
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
        assert_eq!(band_of(3.0, 3.0), Band::In);
        assert_eq!(band_of(3.01, 3.0), Band::Above);
        assert_eq!(band_of(-3.0, 3.0), Band::In);
        assert_eq!(band_of(-3.01, 3.0), Band::Below);
    }

    #[test]
    fn level_above_threshold_fires_once_not_every_tick() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);

        assert!(t.update(&s, 100.0, 3.5).is_empty());

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

    #[test]
    fn rearms_after_returning_to_band() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(Some(3.0), vec![]);

        t.update(&s, 100.0, 0.0);
        assert_eq!(t.update(&s, 100.0, 3.5).len(), 1);
        assert!(t.update(&s, 100.0, 1.0).is_empty());
        assert_eq!(t.update(&s, 100.0, 3.5).len(), 1);
    }

    #[test]
    fn fires_once_when_jumping_across_band() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);

        t.update(&s, 100.0, -5.0);
        let ev = t.update(&s, 100.0, 5.0);
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

        t.update(&s, 10.40, 0.0);
        assert!(t.update(&s, 10.45, 0.0).is_empty());
        assert_eq!(t.update(&s, 10.55, 0.0).len(), 1);
        assert!(t.update(&s, 10.60, 0.0).is_empty());
    }

    #[test]
    fn below_direction_line_is_silent_when_price_rises_through_it() {
        let mut t = CrossingTracker::new();
        let s = spec(None, vec![line(9.5, LineDirection::Below)]);

        t.update(&s, 9.40, 0.0);
        assert!(t.update(&s, 9.60, 0.0).is_empty());
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
        let both = t.update(&s, 10.6, 0.0);
        assert_eq!(both.len(), 1);
    }

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
        assert!(t.update(&s, 100.0, 4.0).is_empty());
    }

    #[test]
    fn hysteresis_band_transitions() {
        assert_eq!(next_band(Band::In, 3.01, 3.0), Band::Above);
        assert_eq!(next_band(Band::In, -3.01, 3.0), Band::Below);
        assert_eq!(next_band(Band::In, 2.99, 3.0), Band::In);

        assert_eq!(next_band(Band::Above, 3.13, 3.0), Band::Above);
        assert_eq!(next_band(Band::Above, 2.99, 3.0), Band::Above);
        assert_eq!(next_band(Band::Above, 2.60, 3.0), Band::Above);
        assert_eq!(next_band(Band::Above, 2.54, 3.0), Band::In);

        assert_eq!(next_band(Band::Below, -3.13, 3.0), Band::Below);
        assert_eq!(next_band(Band::Below, -2.99, 3.0), Band::Below);
        assert_eq!(next_band(Band::Below, -2.60, 3.0), Band::Below);
        assert_eq!(next_band(Band::Below, -2.54, 3.0), Band::In);
    }

    #[test]
    fn jitter_around_threshold_does_not_fire_repeatedly() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(Some(3.0), vec![]);

        t.update(&s, 10.0, 0.0);

        let ev = t.update(&s, 10.0, 3.13);
        assert_eq!(ev.len(), 1);

        // Values just above the 3.0 threshold must not re-fire through the
        // hysteresis band. (3.12 rather than a value that reads like PI.)
        let jitter = [2.99, 3.13, 2.95, 3.08, 3.00, 2.85, 3.12, 2.75, 3.05];
        for &pct in &jitter {
            assert!(
                t.update(&s, 10.0, pct).is_empty(),
                "Jitter at {pct}% should not trigger notification",
            );
        }

        assert!(t.update(&s, 10.0, 2.40).is_empty());
        assert_eq!(t.update(&s, 10.0, 3.20).len(), 1);
    }

    #[test]
    fn cooldown_suppresses_rapid_rearm_firing() {
        let mut t = CrossingTracker::new();
        let s = spec(Some(3.0), vec![]);
        let t0 = Instant::now();

        t.update_at(&s, 10.0, 0.0, t0);
        assert_eq!(t.update_at(&s, 10.0, 3.5, t0).len(), 1);

        assert!(t.update_at(&s, 10.0, 1.0, t0 + Duration::from_secs(10)).is_empty());
        assert!(t.update_at(&s, 10.0, 3.5, t0 + Duration::from_secs(30)).is_empty());

        assert!(t.update_at(&s, 10.0, 1.0, t0 + Duration::from_secs(290)).is_empty());
        assert_eq!(t.update_at(&s, 10.0, 3.5, t0 + Duration::from_secs(305)).len(), 1);
    }

    #[test]
    fn index_with_explicit_price_line_alerts_properly() {
        let mut t = CrossingTracker::without_cooldown();
        let s = WatchSpec {
            code: "sh000001".into(),
            alert_pct: Some(1.0),
            price_lines: vec![line(3300.0, LineDirection::Above)],
        };
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh000001", 3250.0, 0.0, 10000.0);
        assert!(t.update_quote_at(&s, &q0, &cfg, t0).is_empty());

        let q1 = mock_quote("sh000001", 3310.0, 1.8, 20000.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert_eq!(evs.len(), 1);
        assert!(matches!(evs[0], CrossingEvent::PriceLine { price: 3310.0, .. }));
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

#[path = "anomaly.rs"]
mod anomaly;
