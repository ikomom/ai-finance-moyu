//! Tests for `mod` (tests).
//!
//! Kept out of the implementation file so every source file stays inside
//! the 300-line budget mandated by AGENTS.md §11.

    use super::*;
    #[allow(unused_imports)]
    use crate::config::DataSource;

    // ---------------------------------------------------------- Tencent

    const TENCENT_QUOTE_LINE: &str = "v_sh600000=\"1~浦发银行~600000~9.58~9.48~9.45~370939~200763~170143~9.58~838~9.57~2488~9.56~2422~9.55~7581~9.54~697~9.59~12062~9.60~16675~9.61~5938~9.62~4625~9.63~5436~~20261008104145~0.10~1.05~9.59~9.41~9.58/370939/353156021~370939~35316~0.11~6.23~~9.59~9.41~1.90~3190.70~3190.70~0.42~10.43~8.53~1.37~-30710~9.52~5.15~6.38~~~0.01~35315.6021~0.0000~0~   A~GP-A~-20.30~6.68~4.38~6.14~0.50~13.11~8.07~5.27~3.23~11.66~33305838300~33305838300~-52.26~-17.27~33305838300~~~-16.55~0.00~~CNY~0~___D__F__N~9.68~-4889~\";";

    fn synth_line(varname: &str, name: &str, code: &str, price: &str, pre_close: &str) -> String {
        let mut f = vec!["0".to_string(); 88];
        f[0] = "1".into();
        f[1] = name.into();
        f[2] = code.into();
        f[3] = price.into();
        f[4] = pre_close.into();
        f[5] = price.into();
        f[29] = String::new();
        f[30] = "20261008104154".into();
        format!("{varname}=\"{}\";", f.join("~"))
    }

    #[test]
    fn tencent_parses_verbatim_line_against_live_field_layout() {
        let quotes = tencent::parse_quotes(TENCENT_QUOTE_LINE);
        assert_eq!(quotes.len(), 1);

        let p = &quotes[0];
        assert_eq!(p.code, "sh600000");
        assert_eq!(p.name, "浦发银行");
        assert_eq!(p.price, 9.58);
        assert_eq!(p.pre_close, 9.48);
        assert_eq!(p.open, 9.45);
        assert_eq!(p.volume, 370939.0);
        assert_eq!(p.high, 9.59);
        assert_eq!(p.low, 9.41);
        assert_eq!(p.change, 0.10);
        assert_eq!(p.change_pct, 1.05);
        assert_eq!(p.time, "20261008104145");
        assert_eq!(p.date, "20261008");
        assert_eq!(p.outer_vol, 200763.0);
        assert_eq!(p.inner_vol, 170143.0);
        assert_eq!(p.bids.len(), 5);
        assert_eq!(p.asks.len(), 5);
        assert_eq!(p.bids[0], (9.58, 838.0));
        assert_eq!(p.asks[0], (9.59, 12062.0));
        assert!((p.bid_ask_imbalance - (-0.5226)).abs() < 0.001);
        assert!((p.active_buy_ratio - 0.5413).abs() < 0.001);
    }

    #[test]
    fn tencent_parses_multiple_lines_in_one_body() {
        let body = format!(
            "{TENCENT_QUOTE_LINE}\n{}\n{}\n",
            synth_line("v_sz300750", "宁德时代", "300750", "291.53", "291.11"),
            synth_line("v_sh000001", "上证指数", "000001", "3838.45", "3842.19"),
        );
        let quotes = tencent::parse_quotes(&body);
        assert_eq!(quotes.len(), 3);
        assert_eq!(quotes[1].code, "sz300750");
        assert_eq!(quotes[2].code, "sh000001");
    }

    #[test]
    fn tencent_distinguishes_securities_that_share_a_bare_code() {
        let body = format!(
            "{}\n{}\n",
            synth_line("v_sh000001", "上证指数", "000001", "3838.45", "3842.19"),
            synth_line("v_sz000001", "平安银行", "000001", "11.75", "11.57"),
        );
        let quotes = tencent::parse_quotes(&body);

        assert_eq!(quotes.len(), 2);
        assert_eq!(quotes[0].code, "sh000001");
        assert_eq!(quotes[1].code, "sz000001");
        assert_ne!(quotes[0].code, quotes[1].code);
        assert_eq!(quotes[0].name, "上证指数");
        assert_eq!(quotes[1].name, "平安银行");
    }

    #[test]
    fn tencent_skips_blank_and_unrecognised_lines() {
        assert!(tencent::parse_quotes("").is_empty());
        assert!(tencent::parse_quotes("\n\n").is_empty());
        assert!(tencent::parse_quotes("garbage").is_empty());
        assert!(tencent::parse_quotes("v_sh999999=\"\";").is_empty());
        assert!(tencent::parse_quotes("v_sh600000=\"1~浦发银行~600000\";").is_empty());
    }

    #[test]
    fn tencent_parses_trend_rows_and_derives_average_price() {
        let p = tencent::parse_trend_point("0930 9.45 4515 4266675.00").unwrap();
        assert_eq!(p.time, 930);
        assert_eq!(p.price, 9.45);
        assert_eq!(p.cum_volume, 4515.0);
        assert_eq!(p.cum_amount, 4266675.0);
        assert!((p.avg_price - 9.45).abs() < 1e-9);

        let p2 = tencent::parse_trend_point("1032 9.59 343128 326520791.36").unwrap();
        assert_eq!(p2.time, 1032);
        assert!((p2.avg_price - 9.5165).abs() < 0.001);
    }

    #[test]
    fn tencent_trend_point_survives_missing_volume() {
        let p = tencent::parse_trend_point("0930 9.45 0 0").unwrap();
        assert_eq!(p.avg_price, 9.45);
        assert!(p.avg_price.is_finite());
    }

    #[test]
    fn tencent_rejects_malformed_trend_rows() {
        assert!(tencent::parse_trend_point("").is_none());
        assert!(tencent::parse_trend_point("0930").is_none());
        assert!(tencent::parse_trend_point("0930 abc 1 2").is_none());
    }

    #[test]
    fn tencent_parses_full_trend_envelope() {
        let rows: Vec<String> = (0..64)
            .map(|i| {
                let minutes = 9 * 60 + 30 + i;
                let hhmm = (minutes / 60) * 100 + (minutes % 60);
                format!("\"{hhmm:04} 9.45 4515 4266675.00\"")
            })
            .collect();
        let json = format!(
            r#"{{"code":0,"msg":"","data":{{"sh600000":{{
                "data":{{"date":"20261008","data":[{}]}},
                "qt":{{"sh600000":["1","浦发银行","600000","9.58","9.48","9.45"]}},
                "mx_price":{{"price":"","mx":""}}
            }}}}}}"#,
            rows.join(",")
        );

        let t = tencent::parse_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(t.code, "sh600000");
        assert_eq!(t.date, "20261008");
        assert_eq!(t.pre_close, 9.48);
        assert_eq!(t.points.len(), 64);
        assert_eq!(t.points[0].time, 930);
        assert_eq!(t.points[63].time, 1033);
        assert!((t.points[0].avg_price - 9.45).abs() < 1e-9);
    }

    #[test]
    fn tencent_trend_errors_are_not_panics() {
        assert!(tencent::parse_trend("sh600000", b"not json").is_err());
        assert!(tencent::parse_trend("sh600000", b"{}").is_err());
        assert!(tencent::parse_trend("sh600000", br#"{"code":0,"msg":"","data":{}}"#).is_err());
    }


    fn sina_bar(day: &str, open: &str, close: &str, volume: &str, amount: &str) -> String {
        format!(
            r#"{{"day":"{day}","open":"{open}","high":"{close}","low":"{open}","close":"{close}","volume":"{volume}","amount":"{amount}"}}"#
        )
    }

mod kline_tests;
mod sina_tests;
