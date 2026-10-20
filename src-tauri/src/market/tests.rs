//! Unit tests for `market`.
//!
//! Kept in their own file so the implementation stays inside the 300-line
//! budget mandated by AGENTS.md §11.

    use super::*;
    use chrono::NaiveDate;

    fn dt(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, mo, d).unwrap().and_hms_opt(h, mi, 0).unwrap()
    }

    #[test]
    fn normalizes_bare_codes_by_leading_digits() {
        assert_eq!(normalize_code("600000").unwrap(), "sh600000");
        assert_eq!(normalize_code("688981").unwrap(), "sh688981");
        assert_eq!(normalize_code("000001").unwrap(), "sz000001");
        assert_eq!(normalize_code("300750").unwrap(), "sz300750");
        assert_eq!(normalize_code("399006").unwrap(), "sz399006");
        assert_eq!(normalize_code("830799").unwrap(), "bj830799");
    }

    #[test]
    fn keeps_existing_prefix_and_lowercases() {
        assert_eq!(normalize_code("sh600000").unwrap(), "sh600000");
        assert_eq!(normalize_code("SH600000").unwrap(), "sh600000");
        assert_eq!(normalize_code("  sz300750  ").unwrap(), "sz300750");
        assert_eq!(normalize_code("sh000001").unwrap(), "sh000001");
    }

    /// The whole reason `quote.rs` parses the variable name instead of the code
    /// field: these two are different securities that both report `000001`.
    #[test]
    fn sh_and_sz_same_digits_do_not_collide() {
        assert_ne!(normalize_code("sh000001").unwrap(), normalize_code("sz000001").unwrap());
    }

    #[test]
    fn rejects_garbage() {
        assert!(normalize_code("").is_err());
        assert!(normalize_code("60000").is_err());
        assert!(normalize_code("abcdef").is_err());
        assert!(normalize_code("sh60000").is_err());
        assert!(normalize_code("990000").is_err());
    }

    #[test]
    fn session_boundaries_weekday() {
        // 2026-10-08 is a Thursday.
        assert_eq!(session_at(dt(2026, 10, 8, 9, 0)), Session::PreOpen);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 15)), Session::CallAuctionCancelable);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 19)), Session::CallAuctionCancelable);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 20)), Session::CallAuctionLocked);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 24)), Session::CallAuctionLocked);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 25)), Session::PreTrade);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 29)), Session::PreTrade);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 30)), Session::Morning);
        assert_eq!(session_at(dt(2026, 10, 8, 11, 30)), Session::Morning);
        assert_eq!(session_at(dt(2026, 10, 8, 11, 31)), Session::LunchBreak);
        assert_eq!(session_at(dt(2026, 10, 8, 12, 59)), Session::LunchBreak);
        assert_eq!(session_at(dt(2026, 10, 8, 13, 0)), Session::Afternoon);
        assert_eq!(session_at(dt(2026, 10, 8, 14, 56)), Session::Afternoon);
        assert_eq!(session_at(dt(2026, 10, 8, 14, 57)), Session::ClosingAuction);
        assert_eq!(session_at(dt(2026, 10, 8, 15, 0)), Session::ClosingAuction);
        assert_eq!(session_at(dt(2026, 10, 8, 15, 1)), Session::Closed);
        assert_eq!(session_at(dt(2026, 10, 8, 23, 59)), Session::Closed);
    }

    #[test]
    fn weekend_is_always_closed() {
        // 2026-10-10 is a Saturday, 2026-10-11 a Sunday.
        assert_eq!(session_at(dt(2026, 10, 10, 10, 0)), Session::Closed);
        assert_eq!(session_at(dt(2026, 10, 11, 14, 0)), Session::Closed);
    }

    #[test]
    fn is_live_matches_polling_windows() {
        assert!(Session::CallAuctionCancelable.is_live());
        assert!(Session::CallAuctionLocked.is_live());
        assert!(Session::Morning.is_live());
        assert!(Session::Afternoon.is_live());
        assert!(Session::ClosingAuction.is_live());
        assert!(!Session::PreOpen.is_live());
        assert!(!Session::PreTrade.is_live());
        assert!(!Session::LunchBreak.is_live());
        assert!(!Session::Closed.is_live());
    }

    #[test]
    fn parses_time_and_calculates_elapsed_minutes() {
        assert_eq!(parse_time_to_minutes("09:30:00"), Some(570));
        assert_eq!(parse_time_to_minutes("10:00:00"), Some(600));
        assert_eq!(parse_time_to_minutes("20261015143000"), Some(870));
        assert_eq!(parse_time_to_minutes("150000"), Some(900));
        assert_eq!(parse_time_to_minutes("invalid"), None);

        // 09:30 or before -> 1.0 min
        assert_eq!(elapsed_trading_minutes_at_minute(570), 1.0);
        // 10:00 -> 30.0 mins
        assert_eq!(elapsed_trading_minutes_at_minute(600), 30.0);
        // 11:30 -> 120.0 mins
        assert_eq!(elapsed_trading_minutes_at_minute(690), 120.0);
        // 12:00 (lunch) -> 120.0 mins
        assert_eq!(elapsed_trading_minutes_at_minute(720), 120.0);
        // 13:00 -> 120.0 mins
        assert_eq!(elapsed_trading_minutes_at_minute(780), 120.0);
        // 14:00 -> 180.0 mins
        assert_eq!(elapsed_trading_minutes_at_minute(840), 180.0);
        // 15:00 -> 240.0 mins
        assert_eq!(elapsed_trading_minutes_at_minute(900), 240.0);
        // 16:00 -> 240.0 mins
        assert_eq!(elapsed_trading_minutes_at_minute(960), 240.0);
    }

    #[test]
    fn test_calculate_limit_prices() {
        // Main Board 10%
        let (up, down) = calculate_limit_prices("sh600000", "浦发银行", 10.00).unwrap();
        assert_eq!(up, 11.00);
        assert_eq!(down, 9.00);

        // Main Board rounding to cent
        let (up2, down2) = calculate_limit_prices("sz000001", "平安银行", 9.45).unwrap();
        assert_eq!(up2, 10.40);
        assert_eq!(down2, 8.50);

        // ChiNext (20%)
        let (up_gem, down_gem) = calculate_limit_prices("sz300750", "宁德时代", 200.00).unwrap();
        assert_eq!(up_gem, 240.00);
        assert_eq!(down_gem, 160.00);

        // STAR Market (20%)
        let (up_star, down_star) = calculate_limit_prices("sh688981", "中芯国际", 50.00).unwrap();
        assert_eq!(up_star, 60.00);
        assert_eq!(down_star, 40.00);

        // BSE (30%)
        let (up_bse, down_bse) = calculate_limit_prices("bj830799", "艾融软件", 20.00).unwrap();
        assert_eq!(up_bse, 26.00);
        assert_eq!(down_bse, 14.00);

        // ST (5%)
        let (up_st, down_st) = calculate_limit_prices("sh600123", "*ST测试", 5.00).unwrap();
        assert_eq!(up_st, 5.25);
        assert_eq!(down_st, 4.75);

        assert!(calculate_limit_prices("sh600000", "无效", 0.0).is_none());
    }
