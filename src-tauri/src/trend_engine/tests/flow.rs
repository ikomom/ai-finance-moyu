//! Order-flow, ORB and sector-linkage pattern tests.
//!
//! Split from `tests.rs` to stay inside the 300-line budget (AGENTS.md §11).

    use super::*;

    #[test]
    fn detects_aggressive_buying_and_panic_dumping() {
        let mut pv = Vec::new();
        for _ in 0..10 {
            pv.push((10.0, 100.0));
        }
        pv.push((10.03, 100.0));

        let t = mock_trend("sh600000", &pv, 10.0, false);

        // Aggressive buying
        let mut q_buy = mock_quote("sh600000", 10.03, 10.0, 0.3);
        q_buy.bid_ask_imbalance = 0.60;
        q_buy.active_buy_ratio = 0.70;
        q_buy.outer_vol = 5000.0;
        q_buy.inner_vol = 2000.0;
        let sig_buy = analyze_trend(&q_buy, Some(&t), None).unwrap();
        assert_eq!(sig_buy.state, TrendState::AggressiveBuying);
        assert_eq!(sig_buy.compact_label, "抢筹");

        // Panic dumping
        let mut q_dump = mock_quote("sh600000", 9.92, 10.0, -0.8);
        q_dump.bid_ask_imbalance = -0.65;
        q_dump.active_buy_ratio = 0.28;
        let sig_dump = analyze_trend(&q_dump, Some(&t), None).unwrap();
        assert_eq!(sig_dump.state, TrendState::PanicDumping);
        assert_eq!(sig_dump.compact_label, "出逃");
    }

    #[test]
    fn detects_orb_breakout() {
        let mut pv = Vec::new();
        // Bars from 09:30 to 09:45 (16 bars: 930..=945)
        for i in 0..16 {
            pv.push((10.0 + (i as f64) * 0.01, 50.0)); // high will be 10.15, low 10.0
        }
        // Minute 09:46 and 09:47: breaks above 10.15 with volume surge
        pv.push((10.17, 100.0));
        pv.push((10.20, 120.0));

        let mut t = mock_trend("sh600000", &pv, 10.0, false);
        // Correct time stamps: 930..=947
        for (i, p) in t.points.iter_mut().enumerate() {
            p.time = 930 + (i as u32);
        }

        let q = mock_quote("sh600000", 10.20, 10.0, 2.0);
        let sig = analyze_trend(&q, Some(&t), None).unwrap();
        assert_eq!(sig.state, TrendState::OrbBreakoutUp);
        assert_eq!(sig.compact_label, "突破");
        assert_eq!(sig.orb_high, Some(10.15));
        assert_eq!(sig.orb_low, Some(10.0));
    }

    #[test]
    fn detects_sector_linkage_role() {
        let mut pv = Vec::new();
        for _ in 0..10 {
            pv.push((10.0, 50.0));
        }
        let t = mock_trend("sh600000", &pv, 10.0, false);
        let q = mock_quote("sh600000", 10.05, 10.0, 0.5);

        let linkage = crate::market_overview::SectorLinkage {
            sector_code: "pt01".into(),
            sector_name: "白酒Ⅱ".into(),
            sector_change_pct: -1.5,
            delta_r_sector: 2.0,
            delta_r_market: 1.8,
            leader_code: "sh600519".into(),
            leader_name: "贵州茅台".into(),
            leader_change_pct: 0.8,
            role: "逆势抗跌核心".into(),
            diagnosis: "逆势走强，资金承接良好".into(),
        };

        let sig = analyze_trend(&q, Some(&t), Some(linkage)).unwrap();
        assert_eq!(sig.state, TrendState::IndependentAlpha);
        assert_eq!(sig.compact_label, "抗跌");
        assert!(sig.sector_linkage.is_some());
    }

    #[test]
    fn detects_limit_board_four_states() {
        let pv = vec![(4.42, 50.0); 10];
        let t = mock_trend("sh600293", &pv, 4.91, false);

        // 1. 封死跌停 (三峡新材真实跌停场景)
        let mut q_limit_down = mock_quote("sh600293", 4.42, 4.91, -9.98);
        q_limit_down.name = "三峡新材".into();
        q_limit_down.low = 4.42;
        q_limit_down.bids = vec![];
        q_limit_down.asks = vec![(4.42, 50000.0)];
        q_limit_down.bid_ask_imbalance = -1.0;
        let sig_down = analyze_trend(&q_limit_down, Some(&t), None).unwrap();
        assert_eq!(sig_down.state, TrendState::SealedLimitDown);
        assert_eq!(sig_down.compact_label, "跌停");
        assert!(sig_down.summary.contains("死封跌停"));
        assert!(sig_down.summary.contains("严禁伸手接飞刀"));

        // 2. 跌停翘板
        let mut q_broken_down = mock_quote("sh600293", 4.55, 4.91, -7.33);
        q_broken_down.name = "三峡新材".into();
        q_broken_down.low = 4.42;
        let sig_broken_down = analyze_trend(&q_broken_down, Some(&t), None).unwrap();
        assert_eq!(sig_broken_down.state, TrendState::BrokenLimitDown);
        assert_eq!(sig_broken_down.compact_label, "翘板");
        assert!(sig_broken_down.summary.contains("跌停板被巨量撬板资金撬开"));

        // 3. 封死涨停
        let mut q_limit_up = mock_quote("sh600000", 11.00, 10.00, 10.0);
        q_limit_up.name = "浦发银行".into();
        q_limit_up.high = 11.00;
        q_limit_up.asks = vec![];
        q_limit_up.bids = vec![(11.00, 80000.0)];
        q_limit_up.bid_ask_imbalance = 1.0;
        let sig_up = analyze_trend(&q_limit_up, Some(&t), None).unwrap();
        assert_eq!(sig_up.state, TrendState::SealedLimitUp);
        assert_eq!(sig_up.compact_label, "涨停");
        assert!(sig_up.summary.contains("牢牢封死涨停"));

        // 4. 涨停炸板
        let mut q_broken_up = mock_quote("sh600000", 10.80, 10.00, 8.0);
        q_broken_up.name = "浦发银行".into();
        q_broken_up.high = 11.00;
        let sig_broken_up = analyze_trend(&q_broken_up, Some(&t), None).unwrap();
        assert_eq!(sig_broken_up.state, TrendState::BrokenLimitUp);
        assert_eq!(sig_broken_up.compact_label, "炸板");
        assert!(sig_broken_up.summary.contains("涨停板被大单砸开炸板"));
    }
