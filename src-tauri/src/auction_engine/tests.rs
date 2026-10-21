//! Unit tests for `auction_engine`.
//!
//! Kept in their own file so the implementation stays inside the 300-line
//! budget mandated by AGENTS.md §11.

    use super::*;
    use crate::market::Session;
    use crate::quote::Quote;

    #[test]
    fn parses_various_time_formats() {
        assert_eq!(parse_time_hhmm("09:18:25"), 918);
        assert_eq!(parse_time_hhmm("09:24:00"), 924);
        assert_eq!(parse_time_hhmm("20261013091930"), 919);
        assert_eq!(parse_time_hhmm("0920"), 920);
    }

    #[test]
    fn detects_bull_trap_fake_spike_and_cancel() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(915, 10.2, 500.0),
            AuctionPoint::new(918, 10.8, 5000.0), // +8.0%, 5000手
            AuctionPoint::new(919, 10.7, 4800.0),
            AuctionPoint::new(920, 10.1, 800.0),  // +1.0%, 800手 (撤单暴跌)
            AuctionPoint::new(924, 10.05, 900.0),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BullTrap);
        assert_eq!(diag.label, "⚠️ 疑似诱多");
    }

    #[test]
    fn detects_bull_trap_via_unmatched_buy_order_cancel() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::with_unmatched(915, 10.2, 500.0, 1000.0, UnmatchedSide::Buy),
            AuctionPoint::with_unmatched(918, 10.8, 1000.0, 5000.0, UnmatchedSide::Buy), // 5000手未匹配买单虚托
            AuctionPoint::with_unmatched(920, 10.1, 900.0, 100.0, UnmatchedSide::Buy),  // 买单大撤单98%
            AuctionPoint::with_unmatched(924, 10.05, 900.0, 50.0, UnmatchedSide::Buy),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BullTrap);
        assert!(diag.detail.contains("买单撤离"));
    }

    #[test]
    fn detects_bear_trap_scare_and_rebound() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(915, 9.8, 500.0),
            AuctionPoint::new(918, 9.2, 4000.0), // -8.0% 跌停恐吓
            AuctionPoint::new(920, 9.9, 600.0),  // 撤单拉起至 -1.0%
            AuctionPoint::new(924, 10.05, 800.0), // 翻红
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BearTrap);
        assert_eq!(diag.label, "🟢 疑似诱空");
    }

    #[test]
    fn detects_bear_trap_via_unmatched_sell_order_cancel() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::with_unmatched(915, 9.8, 400.0, 800.0, UnmatchedSide::Sell),
            AuctionPoint::with_unmatched(918, 9.2, 800.0, 4500.0, UnmatchedSide::Sell), // 4500手巨额卖单封杀恐吓
            AuctionPoint::with_unmatched(920, 9.9, 700.0, 200.0, UnmatchedSide::Sell),  // 恐慌卖单撤离
            AuctionPoint::with_unmatched(924, 10.05, 800.0, 100.0, UnmatchedSide::Buy),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::BearTrap);
        assert!(diag.detail.contains("恐慌卖单撤离"));
    }

    #[test]
    fn detects_real_snatching() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(916, 10.2, 1000.0),
            AuctionPoint::new(919, 10.4, 2500.0),
            AuctionPoint::new(920, 10.45, 3000.0),
            AuctionPoint::new(924, 10.5, 3500.0), // +5.0% 持续放量
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::Snatching);
        assert_eq!(diag.label, "🔥 真实抢筹");
    }

    #[test]
    fn detects_real_dumping() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(916, 9.7, 1000.0),
            AuctionPoint::new(919, 9.5, 2000.0),
            AuctionPoint::new(920, 9.4, 2800.0),
            AuctionPoint::new(924, 9.35, 3200.0), // -6.5% 持续沉重
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::Dumping);
        assert_eq!(diag.label, "❄️ 真实抛压");
    }

    #[test]
    fn calculates_matched_and_unmatched_volume_from_quote() {
        let mut tracker = AuctionTracker::new();
        // Quote at 09:18 with Bids: 1500手, Asks: 500手 (Excess Buy)
        let q1 = Quote {
            code: "sh600000".into(),
            name: "浦发银行".into(),
            price: 10.5,
            pre_close: 10.0,
            open: 0.0,
            high: 0.0,
            low: 0.0,
            volume: 0.0,
            bids: vec![(10.5, 1500.0)],
            asks: vec![(10.5, 500.0)],
            date: "20261015".into(),
            time: "09:18:00".into(),
            ..Default::default()
        };
        tracker.update_quote(Session::CallAuctionCancelable, &q1);
        let data = tracker.data.get("sh600000").expect("auction data present");
        assert_eq!(data.points.len(), 1);
        let p = &data.points[0];
        assert_eq!(p.time, 91800);
        assert_eq!(p.raw_time, "09:18:00");
        assert_eq!(p.matched_volume, 500.0);
        assert_eq!(p.unmatched_volume, 1000.0);
        assert_eq!(p.unmatched_side, UnmatchedSide::Buy);
        assert_eq!(p.volume, 1500.0);

        // At 09:25: opening matched anchor
        let q2 = Quote {
            code: "sh600000".into(),
            name: "浦发银行".into(),
            price: 10.4,
            pre_close: 10.0,
            open: 10.4,
            high: 10.4,
            low: 10.4,
            volume: 2000.0,
            bids: vec![(10.4, 0.0)],
            asks: vec![(10.4, 0.0)],
            date: "20261015".into(),
            time: "09:25:00".into(),
            ..Default::default()
        };
        tracker.update_quote(Session::PreTrade, &q2);
        let data = tracker.data.get("sh600000").expect("auction data present");
        assert_eq!(data.points.len(), 2);
        let p2 = &data.points[1];
        assert_eq!(p2.time, 92500);
        assert_eq!(p2.raw_time, "09:25:00");
        assert_eq!(p2.matched_volume, 2000.0);
        assert_eq!(p2.unmatched_volume, 0.0);
        assert_eq!(p2.unmatched_side, UnmatchedSide::None);
    }

    #[test]
    fn skips_index_symbols_in_auction_tracking() {
        assert!(is_index_symbol("sh000001"));
        assert!(is_index_symbol("sz399001"));
        assert!(is_index_symbol("sz399006"));
        assert!(is_index_symbol("bj899050"));
        assert!(!is_index_symbol("sh600000"));
        assert!(!is_index_symbol("sz000001"));

        let mut tracker = AuctionTracker::new();
        let index_q = Quote {
            code: "sh000001".into(),
            name: "上证指数".into(),
            price: 3300.0,
            pre_close: 3280.0,
            open: 3300.0,
            high: 3300.0,
            low: 3280.0,
            volume: 10000.0,
            change: 20.0,
            change_pct: 0.61,
            date: "20261013".into(),
            time: "09:24:00".into(),
            ..Default::default()
        };
        tracker.update_quote(Session::CallAuctionLocked, &index_q);
        assert!(!tracker.data.contains_key("sh000001"), "Index should not be tracked in auction data");
    }

    #[test]
    fn cold_start_after_920_returns_normal_diagnosis() {
        let pre_close = 10.0;
        let points = vec![
            AuctionPoint::new(922, 10.3, 2000.0),
            AuctionPoint::new(924, 10.35, 2500.0),
        ];
        let diag = evaluate_auction(pre_close, &points).expect("diagnosis");
        assert_eq!(diag.tag, AuctionTag::Normal);
        assert_eq!(diag.label, "竞价撮合中");
        assert!(diag.detail.contains("缺少试盘阶段对比"));
    }

    #[test]
    fn tracks_closing_call_auction_points() {
        let mut tracker = AuctionTracker::new();
        let q = Quote {
            code: "sh600000".into(),
            name: "浦发银行".into(),
            price: 9.70,
            pre_close: 10.0,
            bids: vec![(9.70, 800.0)],
            asks: vec![(9.70, 65000.0)],
            date: "20261021".into(),
            time: "14:58:12".into(),
            ..Default::default()
        };
        tracker.update_quote(Session::ClosingAuction, &q);
        let data = tracker.data.get("sh600000").expect("closing auction data present");
        assert_eq!(data.closing_points.len(), 1);
        let p = &data.closing_points[0];
        assert_eq!(p.time, 145812);
        assert_eq!(p.raw_time, "14:58:12");
        assert_eq!(p.matched_volume, 800.0);
        assert_eq!(p.unmatched_volume, 64200.0);
        assert_eq!(p.unmatched_side, UnmatchedSide::Sell);
    }
