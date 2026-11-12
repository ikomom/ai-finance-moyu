use std::time::{Duration, Instant};
use crate::config::AnomalyAlertConfig;
use crate::crossing::types::{CrossingEvent, WatchSpec};
use crate::crossing::CrossingTracker;

fn mock_quote(code: &str, price: f64, pct: f64, high: f64, low: f64) -> crate::quote::Quote {
    crate::quote::Quote {
        code: code.to_string(),
        name: "测试股票".to_string(),
        price,
        pre_close: 10.0,
        open: 10.0,
        high,
        low,
        volume: 10000.0,
        change: price - 10.0,
        change_pct: pct,
        date: "20261012".to_string(),
        time: "10:00:00".to_string(),
        ..Default::default()
    }
}

#[test]
fn test_trajectory_aware_breakout_and_rearm() {
    let mut t = CrossingTracker::without_cooldown();
    let s = WatchSpec {
        code: "sz000001".into(),
        alert_pct: Some(3.0),
        price_lines: vec![],
    };
    let t0 = Instant::now();

    // 1. Initial tick at 0%
    assert!(t.update_at(&s, 10.0, 0.0, t0).is_empty());

    // 2. Surges up past +3% -> 向上突破 +3.0%
    let evs1 = t.update_at(&s, 10.35, 3.5, t0 + Duration::from_secs(5));
    assert_eq!(evs1.len(), 1);
    match &evs1[0] {
        CrossingEvent::AlertPct { threshold, .. } => {
            assert_eq!(*threshold, 3.0);
            assert!(evs1[0].message("平安银行").contains("向上突破 +3.0%"));
            assert_eq!(evs1[0].badge(), "📈突破+3.0%(+3.50%)");
        }
        _ => panic!("Expected AlertPct"),
    }

    // 3. Surges further to +5.2% -> Tier 2 递进
    let evs2 = t.update_at(&s, 10.52, 5.2, t0 + Duration::from_secs(10));
    assert_eq!(evs2.len(), 1);
    match &evs2[0] {
        CrossingEvent::AlertPct { threshold, tier, .. } => {
            assert_eq!(*threshold, 5.0);
            assert_eq!(*tier, 2);
            assert!(evs2[0].message("平安银行").contains("强势冲破 +5.0%"));
            assert_eq!(evs2[0].badge(), "📈突破+5.0%(+5.20%)");
        }
        _ => panic!("Expected AlertPct tier 2"),
    }

    // 4. Retraces down to 2.4% -> Silent re-arm (does NOT notify '突破')
    let evs3 = t.update_at(&s, 10.24, 2.4, t0 + Duration::from_secs(15));
    assert!(evs3.is_empty(), "Retracing to neutral band must re-arm silently");

    // 5. Re-surges back above +3.0% -> Fires breakout again
    let evs4 = t.update_at(&s, 10.32, 3.2, t0 + Duration::from_secs(20));
    assert_eq!(evs4.len(), 1);
    assert_eq!(evs4[0].badge(), "📈突破+3.0%(+3.20%)");
}

#[test]
fn test_trajectory_aware_breakdown_distinguishes_from_breakout() {
    let mut t = CrossingTracker::without_cooldown();
    let s = WatchSpec {
        code: "sz000001".into(),
        alert_pct: Some(3.0),
        price_lines: vec![],
    };
    let t0 = Instant::now();

    // 1. Initial tick at 0%
    t.update_at(&s, 10.0, 0.0, t0);

    // 2. Drops past -3.2% -> 向下跌破 -3.0% (NEVER calls it "突破"!)
    let evs1 = t.update_at(&s, 9.68, -3.2, t0 + Duration::from_secs(5));
    assert_eq!(evs1.len(), 1);
    match &evs1[0] {
        CrossingEvent::AlertPct { threshold, pct, .. } => {
            assert_eq!(*threshold, 3.0);
            assert_eq!(*pct, -3.2);
            assert!(evs1[0].message("平安银行").contains("向下跌破 -3.0%"));
            assert!(!evs1[0].message("平安银行").contains("突破"), "Downward drop must never be called 突破");
            assert_eq!(evs1[0].badge(), "📉跌破-3.0%(-3.20%)");
        }
        _ => panic!("Expected AlertPct down"),
    }
}

#[test]
fn test_multi_tier_jump_reports_only_highest_tier() {
    let mut t = CrossingTracker::without_cooldown();
    let s = WatchSpec {
        code: "sz000001".into(),
        alert_pct: Some(3.0),
        price_lines: vec![],
    };
    let t0 = Instant::now();

    // Initial tick at 0%
    t.update_at(&s, 10.0, 0.0, t0);

    // Huge jump directly to +7.2% (crossing tier 1: 3%, tier 2: 5%, tier 3: 7%)
    let evs = t.update_at(&s, 10.72, 7.2, t0 + Duration::from_secs(5));
    // Must emit ONLY 1 event (the highest tier +7%), not 3 events simultaneously!
    assert_eq!(evs.len(), 1);
    match &evs[0] {
        CrossingEvent::AlertPct { threshold, tier, .. } => {
            assert_eq!(*threshold, 7.0);
            assert_eq!(*tier, 3);
            assert!(evs[0].message("平安银行").contains("爆量大涨突破 +7.0%"));
        }
        _ => panic!("Expected highest tier AlertPct"),
    }
}

#[test]
fn test_intraday_new_high_pullback_not_fired_on_minor_bounce() {
    let mut t = CrossingTracker::without_cooldown();
    let s = WatchSpec {
        code: "sh600000".into(),
        alert_pct: None,
        price_lines: vec![],
    };
    let cfg = AnomalyAlertConfig::default();
    let t0 = Instant::now();

    // 1. Establish high at 10.50 (+5%)
    let q0 = mock_quote("sh600000", 10.50, 5.0, 10.50, 10.0);
    t.update_quote_at(&s, &q0, &cfg, t0);

    // 2. Pulls back to 10.20
    let q1 = mock_quote("sh600000", 10.20, 2.0, 10.50, 10.0);
    t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));

    // 3. Weak bounce 10.20 -> 10.25 (well below 10.50 high): must NOT trigger new high
    let q2 = mock_quote("sh600000", 10.25, 2.5, 10.50, 10.0);
    let evs = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(10));
    assert!(!evs.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { .. })), "Bounce below previous high must not fire IntradayExtreme");
}
