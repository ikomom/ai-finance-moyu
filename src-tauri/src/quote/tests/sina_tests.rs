//! Sina quote/trend parsing tests.
//!
//! Split from `tests.rs` to stay inside the 300-line budget (AGENTS.md §11).

    use super::*;

    // ------------------------------------------------------------- Sina

    const SINA_QUOTE_LINE: &str = "var hq_str_sh600000=\"浦发银行,9.450,9.480,9.700,9.710,9.410,9.690,9.700,88133329,846627073.000,743000,9.690,78700,9.680,24600,9.670,174800,9.660,373300,9.650,2100,9.700,29400,9.710,2155000,9.720,1208743,9.730,1056700,9.740,2026-10-08,13:40:00,00,\";";

    #[test]
    fn sina_parses_verbatim_line_against_live_field_layout() {
        let quotes = sina::parse_quotes(SINA_QUOTE_LINE);
        assert_eq!(quotes.len(), 1);

        let p = &quotes[0];
        assert_eq!(p.code, "sh600000");
        assert_eq!(p.name, "浦发银行");
        assert_eq!(p.open, 9.450);
        assert_eq!(p.pre_close, 9.480);
        assert_eq!(p.price, 9.700);
        assert_eq!(p.high, 9.710);
        assert_eq!(p.low, 9.410);
        assert_eq!(p.time, "13:40:00");
        assert_eq!(p.date, "20261008", "Sina's YYYY-MM-DD must become YYYYMMDD");
        assert_eq!(p.bids.len(), 5);
        assert_eq!(p.asks.len(), 5);
        assert_eq!(p.bids[0], (9.690, 7430.0));
        assert_eq!(p.asks[0], (9.700, 21.0));
        assert!((p.bid_ask_imbalance - (-0.5230)).abs() < 0.001);
    }

    #[test]
    fn sina_converts_share_volume_to_hand() {
        let p = &sina::parse_quotes(SINA_QUOTE_LINE)[0];
        assert!((p.volume - 881_333.29).abs() < 0.01, "got {}", p.volume);
    }

    #[test]
    fn sina_derives_change_and_percent() {
        let p = &sina::parse_quotes(SINA_QUOTE_LINE)[0];
        assert!((p.change - 0.22).abs() < 1e-9, "got {}", p.change);
        assert!((p.change_pct - 2.3207).abs() < 0.001, "got {}", p.change_pct);
    }

    #[test]
    fn sina_skips_suspended_securities() {
        let suspended = "var hq_str_sh600001=\"某停牌股,0.000,0.000,0.000,0.000,0.000,0.000,\
                         0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,0,0.000,\
                         0,0.000,0,0.000,0,0.000,2026-10-08,15:00:00,00,\";";
        assert!(sina::parse_quotes(suspended).is_empty());
    }

    #[test]
    fn sina_skips_blank_and_malformed_lines() {
        assert!(sina::parse_quotes("").is_empty());
        assert!(sina::parse_quotes("\n").is_empty());
        assert!(sina::parse_quotes("garbage").is_empty());
        assert!(sina::parse_quotes("var hq_str_sh999999=\"\";").is_empty());
        assert!(sina::parse_quotes("var hq_str_sh600000=\"浦发银行,9.450,9.480\";").is_empty());
    }

    #[test]
    fn sina_distinguishes_sh_and_sz_by_variable_name() {
        let body = "var hq_str_sh000001=\"上证指数,3838.98,3842.19,3838.45,3864.12,3835.71,0,0,\
             23678401500,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-10-08,13:41:54,00,\";\n\
             var hq_str_sz000001=\"平安银行,11.570,11.570,11.750,11.780,11.540,11.740,11.750,\
             58205600,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-10-08,13:41:54,00,\";\n".to_string();
        let quotes = sina::parse_quotes(&body);
        assert_eq!(quotes.len(), 2);
        assert_eq!(quotes[0].code, "sh000001");
        assert_eq!(quotes[1].code, "sz000001");
        assert_eq!(quotes[0].name, "上证指数");
        assert_eq!(quotes[1].name, "平安银行");
    }


    #[test]
    fn sina_trend_keeps_only_the_most_recent_day() {
        let json = format!(
            "[{},{},{},{}]",
            sina_bar("2026-09-30 14:58:00", "9.30", "9.31", "1000", "9310"),
            sina_bar("2026-09-30 14:59:00", "9.31", "9.32", "1000", "9320"),
            sina_bar("2026-10-08 09:31:00", "9.45", "9.47", "2000", "18940"),
            sina_bar("2026-10-08 09:32:00", "9.47", "9.48", "2000", "18960"),
        );

        let t = sina::parse_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(t.date, "20261008", "must report the newest day");
        assert_eq!(t.points.len(), 3, "previous day must be dropped: {:?}", t.points);
        assert!(t.points.iter().all(|p| p.time >= 930));
        assert!(t.points.iter().all(|p| p.price > 9.4), "9-30 prices leaked in");
    }

    #[test]
    fn sina_trend_accumulates_per_minute_volume() {
        let json = format!(
            "[{},{}]",
            sina_bar("2026-10-08 09:31:00", "9.45", "9.50", "1000", "9500"),
            sina_bar("2026-10-08 09:32:00", "9.50", "9.60", "3000", "28800"),
        );

        let t = sina::parse_trend("sh600000", json.as_bytes()).unwrap();
        let p1 = &t.points[1];
        assert_eq!(p1.time, 931);
        assert_eq!(p1.cum_volume, 10.0, "1000 shares == 10 手");
        assert_eq!(p1.cum_amount, 9500.0);

        let p2 = &t.points[2];
        assert_eq!(p2.time, 932);
        assert_eq!(p2.cum_volume, 40.0, "10 + 3000/100");
        assert_eq!(p2.cum_amount, 9500.0 + 28800.0);
        assert!((p2.avg_price - 9.575).abs() < 1e-9, "got {}", p2.avg_price);
    }

    #[test]
    fn sina_trend_prepends_the_0930_open() {
        let json = format!("[{}]", sina_bar("2026-10-08 09:31:00", "9.45", "9.47", "1000", "9470"));

        let t = sina::parse_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(t.points.len(), 2);
        let open = &t.points[0];
        assert_eq!(open.time, 930);
        assert_eq!(open.price, 9.45, "09:30 should carry the day's opening price");
        assert!(open.avg_price.is_finite());
        assert_eq!(open.avg_price, 9.45);
        assert_eq!(t.points[1].time, 931);
    }

    #[test]
    fn sina_trend_does_not_prepend_when_0930_present() {
        let json = format!(
            "[{},{}]",
            sina_bar("2026-10-08 09:30:00", "9.45", "9.46", "500", "4730"),
            sina_bar("2026-10-08 09:31:00", "9.46", "9.47", "1000", "9470"),
        );
        let t = sina::parse_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(t.points.len(), 2, "no duplicate 09:30 should be inserted");
        assert_eq!(t.points[0].time, 930);
    }

    #[test]
    fn sina_trend_errors_are_not_panics() {
        assert!(sina::parse_trend("sh600000", b"not json").is_err());
        assert!(sina::parse_trend("sh600000", b"[]").is_err());
        assert!(sina::parse_trend("sh600000", b"[{\"day\":\"\"}]").is_err());
    }

    #[test]
    fn sina_trend_url_requests_a_full_session_of_minutes() {
        let url = sina::trend_url("sh600000");
        assert!(url.contains("symbol=sh600000"));
        assert!(url.contains("scale=1"), "must ask for 1-minute bars");
        assert!(url.contains("datalen=300"), "url was {url}");
    }

