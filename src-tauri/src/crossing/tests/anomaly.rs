//! Anomaly-detector tests (rapid moves, extremes, limit boards, volume bursts).
//!
//! Split from `tests.rs` to stay inside the 300-line budget (AGENTS.md §11).

    use std::time::{Duration, Instant};
    use super::*;


    #[test]
    fn detects_rapid_surge_and_drop() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        assert!(t.update_quote_at(&s, &q0, &cfg, t0).is_empty());

        let q1 = mock_quote("sh600000", 10.20, 2.0, 1200.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(evs.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })));

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

        let q1 = mock_quote("sh600000", 10.5, 5.0, 1500.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));
        assert!(evs.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })));

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

        let mut q1 = mock_quote("sh600000", 10.98, 9.8, 5000.0);
        q1.bids = vec![(10.98, 2000.0)];
        q1.asks = vec![(11.00, 1500.0)];
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));
        assert!(evs.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::NearLimitUp, .. })));

        let mut q1_repeat = mock_quote("sh600000", 10.97, 9.7, 5200.0);
        q1_repeat.bids = vec![(10.97, 2100.0)];
        q1_repeat.asks = vec![(11.00, 1200.0)];
        let evs_repeat = t.update_quote_at(&s, &q1_repeat, &cfg, t0 + Duration::from_secs(8));
        assert!(evs_repeat.is_empty(), "High oscillation without sealing should NOT spam alerts");

        let mut q_seal = mock_quote("sh600000", 11.00, 10.0, 8000.0);
        q_seal.bids = vec![(11.00, 10000.0)];
        q_seal.asks = vec![];
        let evs_seal = t.update_quote_at(&s, &q_seal, &cfg, t0 + Duration::from_secs(12));
        assert!(evs_seal.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::SealedLimitUp { seal_hands: 10000.0 }, .. })));

        let mut q_loose = mock_quote("sh600000", 11.00, 10.0, 9500.0);
        q_loose.bids = vec![(11.00, 3000.0)];
        q_loose.asks = vec![];
        let evs_loose = t.update_quote_at(&s, &q_loose, &cfg, t0 + Duration::from_secs(16));
        assert!(evs_loose.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::SealLoosening { .. }, .. })));

        let mut q2 = mock_quote("sh600000", 10.85, 8.5, 12000.0);
        q2.bids = vec![(10.85, 1000.0)];
        q2.asks = vec![(10.86, 2000.0)];
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(20));
        assert!(evs2.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::BrokenLimitUp, .. })));
    }

    #[test]
    fn unsealed_pullback_does_not_fire_broken_limit() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        let mut q1 = mock_quote("sh600000", 10.96, 9.6, 2000.0);
        q1.bids = vec![(10.96, 500.0)];
        q1.asks = vec![(10.97, 1000.0)];
        let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));
        assert!(evs1.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::NearLimitUp, .. })));

        let mut q2 = mock_quote("sh600000", 10.80, 8.0, 2500.0);
        q2.bids = vec![(10.80, 500.0)];
        q2.asks = vec![(10.81, 1000.0)];
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(10));
        assert!(!evs2.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::BrokenLimitUp, .. })), "Unsealed stock must NEVER fire broken limit alert");
    }

    #[test]
    fn index_symbols_produce_no_anomaly_alerts() {
        let mut t = CrossingTracker::without_cooldown();
        let s = WatchSpec { code: "sh000001".into(), alert_pct: Some(1.0), price_lines: vec![] };
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh000001", 3300.0, 0.0, 10000.0);
        assert!(t.update_quote_at(&s, &q0, &cfg, t0).is_empty());

        let q1 = mock_quote("sh000001", 3400.0, 3.03, 20000.0);
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(evs.is_empty(), "Index quotes must never produce anomaly popups");
    }

    #[test]
    fn new_high_requires_0_8_pct_breakout_and_filters_micro_movements() {
        let mut t = CrossingTracker::new();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        let q1 = mock_quote("sh600000", 10.01, 0.1, 1005.0);
        let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(5));
        assert!(!evs1.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })), "1 cent micro-movement should NOT fire new high");

        let q2 = mock_quote("sh600000", 10.20, 2.0, 1500.0);
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(10));
        assert!(evs2.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })));

        let q3 = mock_quote("sh600000", 10.30, 3.0, 1800.0);
        let evs3 = t.update_quote_at(&s, &q3, &cfg, t0 + Duration::from_secs(30));
        assert!(!evs3.iter().any(|e| matches!(e, CrossingEvent::IntradayExtreme { is_new_high: true, .. })), "Subsequent breakout within 10 minutes should be suppressed");
    }

    #[test]
    fn price_lines_initialized_individually_and_not_copied_from_first_line() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(
            None,
            vec![line(5.0, LineDirection::Below), line(15.0, LineDirection::Below)],
        );
        assert!(t.update(&s, 10.0, 0.0).is_empty());
        assert!(t.update(&s, 12.0, 0.0).is_empty());

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

        let q0 = mock_quote("sh600000", 10.00, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        let q1 = mock_quote("sh600000", 10.20, 2.0, 1500.0);
        let evs1 = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(evs1.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })));

        let q2 = mock_quote("sh600000", 10.08, 0.8, 1600.0);
        let evs2 = t.update_quote_at(&s, &q2, &cfg, t0 + Duration::from_secs(20));
        assert!(
            !evs2.iter().any(|e| matches!(e, CrossingEvent::RapidChange { is_surge: true, .. })),
            "Pullback on falling tick must NOT fire rapid surge!"
        );
    }


    #[test]
    fn ipo_unrestricted_stocks_skip_limit_board_alerts() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let mut q0 = mock_quote("sz301600", 20.0, 0.0, 1000.0);
        q0.name = "N强达".to_string();
        t.update_quote_at(&s, &q0, &cfg, t0);

        let mut q1 = mock_quote("sz301600", 27.0, 35.0, 5000.0);
        q1.name = "N强达".to_string();
        let evs = t.update_quote_at(&s, &q1, &cfg, t0 + Duration::from_secs(10));
        assert!(
            !evs.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { .. })),
            "IPO stock should not trigger limit board alerts"
        );
    }

    #[test]
    fn volume_burst_distinguishes_buy_sweep_and_sell_dump_and_ignores_flat_ticks() {
        let mut t_up = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        t_up.update_quote_at(&s, &q0, &cfg, t0);

        let q1_up = mock_quote("sh600000", 10.10, 1.0, 50000.0);
        let evs_up = t_up.update_quote_at(&s, &q1_up, &cfg, t0 + Duration::from_secs(25));
        let burst_up = evs_up
            .iter()
            .find(|e| matches!(e, CrossingEvent::VolumeBurst { .. }))
            .expect("Should trigger VolumeBurst on rapid volume surge with price upward push");

        if let CrossingEvent::VolumeBurst { is_surge, delta_pct, change_pct, multiple, price, .. } = burst_up {
            assert!(*is_surge, "Expected is_surge to be true for upward movement");
            assert_eq!(*delta_pct, 1.0);
            assert_eq!(*change_pct, 1.0);
            assert_eq!(*price, 10.10);
            assert!(*multiple >= 3.0);
        } else {
            panic!("Event was not VolumeBurst");
        }
        let msg_up = burst_up.message("测试股票");
        assert!(msg_up.contains("💥 盘口主买扫盘！放量推升 +1.00% (日内 +1.00%)"), "Actual msg: {msg_up}");

        let mut t_down = CrossingTracker::without_cooldown();
        t_down.update_quote_at(&s, &q0, &cfg, t0);

        let q1_down = mock_quote("sh600000", 9.90, -1.0, 50000.0);
        let evs_down = t_down.update_quote_at(&s, &q1_down, &cfg, t0 + Duration::from_secs(25));
        let burst_down = evs_down
            .iter()
            .find(|e| matches!(e, CrossingEvent::VolumeBurst { .. }))
            .expect("Should trigger VolumeBurst on rapid volume surge with price downward dump");

        if let CrossingEvent::VolumeBurst { is_surge, delta_pct, change_pct, multiple, price, .. } = burst_down {
            assert!(!*is_surge, "Expected is_surge to be false for downward movement");
            assert_eq!(*delta_pct, 1.0);
            assert_eq!(*change_pct, -1.0);
            assert_eq!(*price, 9.90);
            assert!(*multiple >= 3.0);
        } else {
            panic!("Event was not VolumeBurst");
        }
        let msg_down = burst_down.message("测试股票");
        assert!(msg_down.contains("💥 盘口主卖砸盘！放量打压 -1.00% (日内 -1.00%)"), "Actual msg: {msg_down}");

        let mut t_flat = CrossingTracker::without_cooldown();
        t_flat.update_quote_at(&s, &q0, &cfg, t0);

        let q1_flat = mock_quote("sh600000", 10.01, 0.1, 50000.0);
        let evs_flat = t_flat.update_quote_at(&s, &q1_flat, &cfg, t0 + Duration::from_secs(25));
        assert!(
            !evs_flat.iter().any(|e| matches!(e, CrossingEvent::VolumeBurst { .. })),
            "Flat tick (< 0.3% price motion) should NOT fire VolumeBurst"
        );
    }

    #[test]
    fn empty_depth_at_closing_does_not_fire_seal_loosening() {
        let mut t = CrossingTracker::without_cooldown();
        let s = spec(None, vec![]);
        let cfg = crate::config::AnomalyAlertConfig::default();
        let t0 = Instant::now();

        let q0 = mock_quote("sh600000", 10.0, 0.0, 1000.0);
        t.update_quote_at(&s, &q0, &cfg, t0);

        let mut q_seal = mock_quote("sh600000", 11.00, 10.0, 8000.0);
        q_seal.bids = vec![(11.00, 100000.0)];
        q_seal.asks = vec![];
        t.update_quote_at(&s, &q_seal, &cfg, t0 + Duration::from_secs(10));

        // 14:57 Closing auction clears depth order book (bids: [], asks: [])
        let mut q_closing = mock_quote("sh600000", 11.00, 10.0, 8500.0);
        q_closing.bids = vec![];
        q_closing.asks = vec![];
        let evs = t.update_quote_at(&s, &q_closing, &cfg, t0 + Duration::from_secs(20));
        assert!(
            !evs.iter().any(|e| matches!(e, CrossingEvent::LimitBoard { board_kind: LimitBoardKind::SealLoosening { .. }, .. })),
            "Empty depth book at closing auction should NOT trigger seal loosening!"
        );
    }
