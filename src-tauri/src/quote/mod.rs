//! Quote fetching from Tencent, Sina, and Yahoo Finance.

pub mod types;
pub mod tencent;
pub mod sina;
pub mod indicators;
pub mod yahoo;
pub mod fetcher;

#[allow(unused_imports)]
pub use types::*;
#[allow(unused_imports)]
pub use indicators::*;
#[allow(unused_imports)]
pub use yahoo::*;
#[allow(unused_imports)]
pub use fetcher::*;

#[cfg(test)]
mod tests {
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
        let body = format!(
            "var hq_str_sh000001=\"上证指数,3838.98,3842.19,3838.45,3864.12,3835.71,0,0,\
             23678401500,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-10-08,13:41:54,00,\";\n\
             var hq_str_sz000001=\"平安银行,11.570,11.570,11.750,11.780,11.540,11.740,11.750,\
             58205600,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2026-10-08,13:41:54,00,\";\n"
        );
        let quotes = sina::parse_quotes(&body);
        assert_eq!(quotes.len(), 2);
        assert_eq!(quotes[0].code, "sh000001");
        assert_eq!(quotes[1].code, "sz000001");
        assert_eq!(quotes[0].name, "上证指数");
        assert_eq!(quotes[1].name, "平安银行");
    }

    fn sina_bar(day: &str, open: &str, close: &str, volume: &str, amount: &str) -> String {
        format!(
            r#"{{"day":"{day}","open":"{open}","high":"{close}","low":"{open}","close":"{close}","volume":"{volume}","amount":"{amount}"}}"#
        )
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
}

#[cfg(test)]
mod live_tests {
    use super::*;
    use crate::config::DataSource;

    fn fetcher() -> Fetcher {
        Fetcher::new().expect("client should build")
    }

    fn is_chinese(s: &str) -> bool {
        s.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c))
    }

    async fn check_quotes(source: DataSource) {
        let codes = vec!["sh600000".to_string(), "sz300750".to_string()];
        let quotes = fetcher()
            .fetch_quotes(source, &codes)
            .await
            .unwrap_or_else(|e| panic!("{source:?} quote fetch failed: {e}"));

        assert_eq!(quotes.len(), codes.len(), "{source:?}: every code should come back");
        for q in &quotes {
            assert!(q.price > 0.0, "{source:?} {} price not positive: {}", q.code, q.price);
            assert!(q.pre_close > 0.0, "{source:?} {} preClose not positive", q.code);
            assert!(
                q.code.starts_with("sh") || q.code.starts_with("sz"),
                "{source:?} code lost its market prefix: {}",
                q.code
            );
            assert_eq!(q.date.len(), 8, "{source:?} {} has a bad date {:?}", q.code, q.date);
            assert!(
                is_chinese(&q.name),
                "{source:?} {} name is not Chinese text: {:?} (GB18030 decode problem?)",
                q.code,
                q.name
            );
            assert!(
                q.change_pct.abs() < 25.0,
                "{source:?} {} absurd changePct {}",
                q.code,
                q.change_pct
            );
        }
    }

    async fn check_trend(source: DataSource) {
        let t = fetcher()
            .fetch_trend(source, "sh600000", 9.48)
            .await
            .unwrap_or_else(|e| panic!("{source:?} trend fetch failed: {e}"));

        assert_eq!(t.code, "sh600000");
        assert_eq!(t.date.len(), 8, "{source:?} bad date {:?}", t.date);
        assert!(t.pre_close > 0.0, "{source:?} preClose not positive");
        assert!(!t.points.is_empty(), "{source:?} no intraday points");
        assert!(t.points.len() <= 241, "{source:?} more points than a session holds");

        let mut prev = 0u32;
        for p in &t.points {
            assert!(
                p.time >= prev,
                "{source:?} timestamp went backwards: {} after {}",
                p.time,
                prev
            );
            prev = p.time;
            assert!(
                (930..=1500).contains(&p.time),
                "{source:?} timestamp outside session: {}",
                p.time
            );
            assert!(p.price > 0.0, "{source:?} non-positive price at {}", p.time);
            assert!(p.avg_price.is_finite() && p.avg_price > 0.0, "{source:?} bad 均价 at {}", p.time);
            let drift = (p.avg_price - p.price).abs() / p.price;
            assert!(drift < 0.25, "{source:?} 均价 drifted {:.0}% at {}", drift * 100.0, p.time);
        }
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_tencent_quotes() {
        check_quotes(DataSource::Tencent).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_tencent_trend() {
        check_trend(DataSource::Tencent).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_sina_quotes() {
        check_quotes(DataSource::Sina).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_sina_trend() {
        check_trend(DataSource::Sina).await;
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_sources_agree_on_price() {
        let f = fetcher();
        let codes = vec!["sh600000".to_string()];
        let t = f.fetch_quotes(DataSource::Tencent, &codes).await.expect("tencent");
        let s = f.fetch_quotes(DataSource::Sina, &codes).await.expect("sina");

        let (tp, sp) = (t[0].price, s[0].price);
        let diff = (tp - sp).abs() / tp;
        assert!(diff < 0.02, "providers disagree by {:.2}%: tencent {tp} vs sina {sp}", diff * 100.0);
    }

    #[tokio::test]
    #[ignore = "hits the live quote API"]
    async fn live_unknown_code_does_not_panic() {
        let f = fetcher();
        for source in [DataSource::Tencent, DataSource::Sina] {
            let r = f.fetch_quotes(source, &["sh999999".to_string()]).await;
            assert!(r.is_ok(), "{source:?}: an unknown code should yield an empty list");
            assert!(r.unwrap().is_empty(), "{source:?}: sh999999 unexpectedly resolved");
        }
    }
}
