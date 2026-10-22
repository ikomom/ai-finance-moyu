//! Tests for anomaly deduplication, cooldowns, and multi-event aggregation.
//!
//! Kept in a dedicated module to adhere to the 300-line budget (AGENTS.md §11).

use std::time::{Duration, Instant};
use super::*;

#[test]
fn rapid_change_cooldown_suppresses_rapid_fire_alerts() {
    let mut t = CrossingTracker::new();
    let s = spec(None, vec![]);
    let cfg = crate::config::AnomalyAlertConfig::default();
    let t0 = Instant::now();

    let q0 = mock_quote("sh600825", 10.00, 0.0, 1000.0);
    assert!(t.update_quote_at(&s, &q0, &cfg, t0).is_empty());

    // First rapid surge (+2.0%)
    let q1 = mock_quote("sh600825", 10.20, 2.0, 1500.0);
    let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
    assert!(
        evs1.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })),
        "First surge should fire"
    );

    // Follow-up tick 10 seconds later: price expands further to 10.35, but within 90s cooldown
    let q2 = mock_quote("sh600825", 10.35, 3.5, 2000.0);
    let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(20));
    assert!(
        !evs2.iter().any(|e| matches!(e, CrossingEvent::RapidChange { .. })),
        "Surge within 90s cooldown must be suppressed"
    );

    // After 95 seconds (cooldown expired): price expands to 10.45 (>= 10.20 * 1.01)
    let q3 = mock_quote("sh600825", 10.45, 4.5, 2500.0);
    let evs3 = t.update_quote_at(&s, &q3, &cfg, t0 + Duration::from_secs(105));
    assert!(
        evs3.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })),
        "Surge after 90s cooldown with expanded wave should fire"
    );
}

#[test]
fn oscillation_does_not_clear_surge_lock_without_structural_reversal() {
    let mut t = CrossingTracker::without_cooldown();
    let s = spec(None, vec![]);
    let cfg = crate::config::AnomalyAlertConfig { volume_burst: false, ..Default::default() };
    let t0 = Instant::now();

    let q0 = mock_quote("sh600000", 10.00, 0.0, 1000.0);
    t.update_quote_at(&s, &q0, &cfg, t0);

    // Wave 1 surge to 10.20
    let q1 = mock_quote("sh600000", 10.20, 2.0, 1500.0);
    let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
    assert!(evs1.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })));

    // Micro dip to 10.12 (-0.78%, does NOT break 2.5% structural threshold 9.945)
    let q2 = mock_quote("sh600000", 10.12, 1.2, 1600.0);
    let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(20));
    assert!(
        !evs2.iter().any(|e| matches!(e, CrossingEvent::RapidChange { .. })),
        "Micro dip must not trigger rapid change"
    );

    // Minor bounce to 10.25 (< 10.20 * 1.010 = 10.302, insufficient wave expansion)
    let q3 = mock_quote("sh600000", 10.25, 2.5, 1800.0);
    let evs3 = t.update_quote_at(&s, &q3, &cfg, t0 + Duration::from_secs(30));
    assert!(
        !evs3.iter().any(|e| matches!(e, CrossingEvent::RapidChange { .. })),
        "Minor bounce below 1.0% wave expansion must not re-trigger surge"
    );

    // Expansion to 10.35 (>= 10.302)
    let q4 = mock_quote("sh600000", 10.35, 3.5, 2200.0);
    let evs4 = t.update_quote_at(&s, &q4, &cfg, t0 + Duration::from_secs(40));
    assert!(
        evs4.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })),
        "Expansion exceeding 1.0% over previous wave must trigger"
    );
}

#[test]
fn oscillation_drop_does_not_clear_drop_lock_without_reversal() {
    let mut t = CrossingTracker::without_cooldown();
    let s = spec(None, vec![]);
    let cfg = crate::config::AnomalyAlertConfig { volume_burst: false, ..Default::default() };
    let t0 = Instant::now();

    let q0 = mock_quote("sh600000", 10.00, 0.0, 1000.0);
    t.update_quote_at(&s, &q0, &cfg, t0);

    // Wave 1 drop to 9.80 (-2.0%)
    let q1 = mock_quote("sh600000", 9.80, -2.0, 1500.0);
    let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
    assert!(evs1.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: false, .. })));

    // Micro rebound to 9.88 (+0.8%, does not break 2.5% structural threshold 10.045)
    let q2 = mock_quote("sh600000", 9.88, -1.2, 1600.0);
    let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(20));
    assert!(
        !evs2.iter().any(|e| matches!(e, CrossingEvent::RapidChange { .. })),
        "Micro rebound must not trigger rapid change"
    );

    // Minor dip to 9.75 (> 9.80 * 0.990 = 9.702, insufficient wave expansion)
    let q3 = mock_quote("sh600000", 9.75, -2.5, 1800.0);
    let evs3 = t.update_quote_at(&s, &q3, &cfg, t0 + Duration::from_secs(30));
    assert!(
        !evs3.iter().any(|e| matches!(e, CrossingEvent::RapidChange { .. })),
        "Minor dip below 1.0% wave expansion must not re-trigger drop"
    );

    // Deep drop to 9.68 (<= 9.702)
    let q4 = mock_quote("sh600000", 9.68, -3.2, 2200.0);
    let evs4 = t.update_quote_at(&s, &q4, &cfg, t0 + Duration::from_secs(40));
    assert!(
        evs4.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: false, .. })),
        "Drop exceeding 1.0% over previous wave must trigger"
    );
}

#[test]
fn desktop_notification_cooldown_rate_limits_to_60s() {
    let mut t = CrossingTracker::new();
    let t0 = Instant::now();

    // First notification for sh600825 allowed
    assert!(t.allow_desktop_notification("sh600825", t0));

    // Second notification for sh600825 15 seconds later is suppressed
    assert!(!t.allow_desktop_notification("sh600825", t0 + Duration::from_secs(15)));

    // Notification for a different security sh600000 is allowed independently
    assert!(t.allow_desktop_notification("sh600000", t0 + Duration::from_secs(15)));

    // After 61 seconds, notification for sh600825 is allowed again
    assert!(t.allow_desktop_notification("sh600825", t0 + Duration::from_secs(61)));
}

#[test]
fn event_badge_and_price_extraction() {
    let surge = CrossingEvent::RapidChange {
        code: "sh600825".into(),
        pct_delta: 2.34,
        is_surge: true,
        price: 5.12,
    };
    assert_eq!(surge.badge(), "🚀急速拉升(+2.34%)");
    assert_eq!(surge.price(), Some(5.12));

    let drop = CrossingEvent::RapidChange {
        code: "sh600825".into(),
        pct_delta: 1.85,
        is_surge: false,
        price: 4.88,
    };
    assert_eq!(drop.badge(), "⚡急速跳水(-1.85%)");
    assert_eq!(drop.price(), Some(4.88));

    let dump = CrossingEvent::VolumeBurst {
        code: "sh600825".into(),
        volume_hands: 5000.0,
        is_surge: false,
        delta_pct: 1.5,
        change_pct: -3.2,
        multiple: 3.5,
        price: 4.88,
    };
    assert_eq!(dump.badge(), "💥盘口砸盘(3.5x)");

    let low = CrossingEvent::IntradayExtreme {
        code: "sh600825".into(),
        is_new_high: false,
        price: 4.88,
        change_pct: -3.2,
    };
    assert_eq!(low.badge(), "📉创日内新低");
}
