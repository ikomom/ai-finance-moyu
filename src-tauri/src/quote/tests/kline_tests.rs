//! Shared decoding, K-line and Yahoo parsing tests.
//!
//! Split from `tests.rs` to stay inside the 300-line budget (AGENTS.md §11).

    use super::*;

    // --------------------------------------------------------- shared

    #[test]
    fn gb18030_bytes_decode_to_chinese_names() {
        let gb: &[u8] = &[0xC6, 0xD6, 0xB7, 0xA2, 0xD2, 0xF8, 0xD0, 0xD0];
        assert_eq!(decode_gb18030(gb), "浦发银行");
        assert_ne!(String::from_utf8_lossy(gb), "浦发银行");
    }

    #[test]
    fn lenient_number_parsing() {
        assert_eq!(num("9.58"), 9.58);
        assert_eq!(num(""), 0.0);
        assert_eq!(num("-"), 0.0);
        assert_eq!(num(" 1.05 "), 1.05);
    }

    #[test]
    fn both_sources_agree_on_trend_point_semantics() {
        let tencent_point = tencent::parse_trend_point("0930 9.45 4515 4266675.00").unwrap();
        let sina_json = format!(
            "[{}]",
            sina_bar("2026-10-08 09:31:00", "9.45", "9.45", "451500", "4266675.00")
        );
        let sina_trend = sina::parse_trend("sh600000", sina_json.as_bytes()).unwrap();
        let sina_point = &sina_trend.points[1];

        assert_eq!(tencent_point.cum_volume, sina_point.cum_volume);
        assert_eq!(tencent_point.cum_amount, sina_point.cum_amount);
        assert!((tencent_point.avg_price - sina_point.avg_price).abs() < 1e-9);
    }

    #[test]
    fn tencent_kline_parsing_and_qfq_support() {
        let json = r#"{
            "code": 0,
            "data": {
                "sh600519": {
                    "qfqday": [
                        ["2026-09-21", "1259.000", "1252.570", "1259.950", "1250.800", "25017.000"],
                        ["2026-09-22", "1252.150", "1253.800", "1265.880", "1248.100", "24573.000"]
                    ]
                }
            }
        }"#;
        let bars = tencent::parse_kline("sh600519", json.as_bytes()).unwrap();
        assert_eq!(bars.len(), 2);
        assert_eq!(bars[0].date, "2026-09-21");
        assert_eq!(bars[0].open, 1259.0);
        assert_eq!(bars[0].close, 1252.57);
        assert_eq!(bars[0].high, 1259.95);
        assert_eq!(bars[0].low, 1250.8);
        assert_eq!(bars[0].volume, 25017.0);
    }

    #[test]
    fn sina_kline_parsing_and_volume_conversion() {
        let json = r#"[
            {"day":"2026-09-21","open":"1259.000","high":"1259.950","low":"1250.800","close":"1252.570","volume":"2501700"},
            {"day":"2026-09-22","open":"1252.150","high":"1265.880","low":"1248.100","close":"1253.800","volume":"2457300"}
        ]"#;
        let bars = sina::parse_kline("sh600519", json.as_bytes()).unwrap();
        assert_eq!(bars.len(), 2);
        assert_eq!(bars[0].date, "2026-09-21");
        assert_eq!(bars[0].open, 1259.0);
        assert_eq!(bars[0].volume, 25017.0);
    }

    #[test]
    fn compute_kline_indicators_ma_and_signals() {
        let mut bars = Vec::new();
        for i in 1..=25 {
            let p = 10.0 + (i as f64) * 0.5;
            bars.push(KLineBar {
                date: format!("2026-01-{:02}", i),
                open: p - 0.2,
                close: p,
                high: p + 0.3,
                low: p - 0.3,
                volume: 1000.0,
                ma5: None,
                ma10: None,
                ma20: None,
                dif: None,
                dea: None,
                macd: None,
            k: None,
            d: None,
            j: None,
            });
        }
        let kline = compute_kline_indicators("sh600000", bars);
        assert_eq!(kline.bars.len(), 25);
        let last = kline.bars.last().unwrap();
        assert!(last.ma5.is_some());
        assert!(last.ma10.is_some());
        assert!(last.ma20.is_some());
        assert!(last.dif.is_some());
        assert!(last.dea.is_some());
        assert!(last.macd.is_some());
        assert!(last.dif.unwrap() > 0.0);
        assert!(last.dea.unwrap() > 0.0);
        assert!(last.ma5.unwrap() > last.ma10.unwrap());
        assert!(last.ma10.unwrap() > last.ma20.unwrap());
        assert_eq!(kline.ma_signal, "bull_aligned");
        assert!(kline.ma_comment.contains("多头排列"));
    }

    #[test]
    fn test_global_code_to_yahoo_symbol() {
        assert_eq!(global_code_to_yahoo_symbol("usIXIC"), Some("^IXIC"));
        assert_eq!(global_code_to_yahoo_symbol("usINX"), Some("^GSPC"));
        assert_eq!(global_code_to_yahoo_symbol("usDJI"), Some("^DJI"));
        assert_eq!(global_code_to_yahoo_symbol("hkHSI"), Some("^HSI"));
        assert_eq!(global_code_to_yahoo_symbol("gzN225"), Some("^N225"));
        assert_eq!(global_code_to_yahoo_symbol("gzKS11"), Some("^KS11"));
        assert_eq!(global_code_to_yahoo_symbol("gzFTSE"), Some("^FTSE"));
        assert_eq!(global_code_to_yahoo_symbol("invalid"), None);
    }

    #[test]
    fn parses_yahoo_chart_json_sample() {
        let json = r#"{
            "chart": {
                "result": [
                    {
                        "timestamp": [1792022400, 1792108800],
                        "indicators": {
                            "quote": [
                                {
                                    "open": [5673.0, 5653.99],
                                    "high": [5751.45, 5809.94],
                                    "low": [5450.81, 5590.33],
                                    "close": [5554.22, 5668.05],
                                    "volume": [385800, 286453]
                                }
                            ]
                        }
                    }
                ],
                "error": null
            }
        }"#;
        let bars = parse_yahoo_chart("gzKS11", json.as_bytes()).unwrap();
        assert_eq!(bars.len(), 2);
        assert_eq!(bars[0].open, 5673.0);
        assert_eq!(bars[0].close, 5554.22);
        assert_eq!(bars[1].high, 5809.94);
        assert_eq!(bars[1].volume, 286453.0);
    }

    #[test]
    fn parses_yahoo_trend_json_sample() {
        let json = r#"{
            "chart": {
                "result": [
                    {
                        "meta": {
                            "previousClose": 5554.22,
                            "chartPreviousClose": 5554.22,
                            "gmtoffset": 32400
                        },
                        "timestamp": [1792108800, 1792108860],
                        "indicators": {
                            "quote": [
                                {
                                    "open": [5653.99, 5660.00],
                                    "high": [5665.41, 5662.50],
                                    "low": [5653.99, 5658.10],
                                    "close": [5660.12, 5661.80],
                                    "volume": [1200, 2400]
                                }
                            ]
                        }
                    }
                ],
                "error": null
            }
        }"#;
        let trend = parse_yahoo_trend("gzKS11", json.as_bytes()).unwrap();
        assert_eq!(trend.code, "gzKS11");
        assert_eq!(trend.pre_close, 5554.22);
        assert_eq!(trend.points.len(), 2);
        assert_eq!(trend.points[0].price, 5660.12);
        assert_eq!(trend.points[0].cum_volume, 1200.0);
        assert_eq!(trend.points[1].price, 5661.80);
        assert_eq!(trend.points[1].cum_volume, 3600.0);
    }
