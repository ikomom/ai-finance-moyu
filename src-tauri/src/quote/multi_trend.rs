//! Multi-day intraday trend fetching and parsing (5-day trend).
//!
//! Provides Tencent & Sina 5-day minute-level series resolution. Kept in a dedicated
//! module to respect the 300-line budget (AGENTS.md §11).

use std::collections::BTreeMap;
use serde::Deserialize;

use super::tencent::parse_trend_point;
use super::types::*;

pub const TENCENT_MULTI_TREND_ENDPOINT: &str =
    "https://web.ifzq.gtimg.cn/appstock/app/day/query?code=";

pub const SINA_MULTI_TREND_ENDPOINT: &str =
    "https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData";

pub fn tencent_multi_trend_url(code: &str) -> String {
    format!("{TENCENT_MULTI_TREND_ENDPOINT}{code}")
}

pub fn sina_multi_trend_url(code: &str) -> String {
    format!("{SINA_MULTI_TREND_ENDPOINT}?symbol={code}&scale=1&ma=no&datalen=1300")
}

#[derive(Deserialize)]
struct TencentMultiDayEnvelope {
    code: i32,
    #[serde(default)]
    data: serde_json::Value,
}

/// Parse Tencent's `appstock/app/day/query` JSON for 5-day minute trend.
pub fn parse_tencent_multi_trend(code: &str, bytes: &[u8]) -> Result<MultiDayTrend, FetchError> {
    let text = String::from_utf8_lossy(bytes);
    let env: TencentMultiDayEnvelope = serde_json::from_str(&text)
        .map_err(|e| parse_err(format!("腾讯五日分时 JSON 解析失败: {e}")))?;

    if env.code != 0 {
        return Err(parse_err(format!("腾讯五日分时接口返回 code={}", env.code)));
    }

    let entry = env
        .data
        .get(code)
        .ok_or_else(|| parse_err(format!("响应中缺少 {code} 的五日分时数据")))?;

    let mut days = Vec::new();

    if let Some(arr) = entry.pointer("/data").and_then(|v| v.as_array()) {
        for day_obj in arr {
            let date = day_obj
                .get("date")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let pre_close = day_obj
                .get("prec")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);

            let mut points = Vec::new();
            if let Some(rows) = day_obj.get("data").and_then(|v| v.as_array()) {
                for row in rows {
                    if let Some(s) = row.as_str() {
                        if let Some(p) = parse_trend_point(s) {
                            points.push(p);
                        }
                    }
                }
            }
            if !points.is_empty() {
                days.push(DayTrend {
                    date,
                    pre_close,
                    points,
                });
            }
        }
        days.sort_by(|a, b| a.date.cmp(&b.date));
    } else if let Some(day_map) = entry.pointer("/data").and_then(|v| v.as_object()) {
        let mut date_keys: Vec<String> = day_map.keys().cloned().collect();
        date_keys.sort();
        for d_key in date_keys {
            if let Some(day_obj) = day_map.get(&d_key) {
                let pre_close = day_obj
                    .get("prec")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);

                let mut points = Vec::new();
                if let Some(rows) = day_obj.get("data").and_then(|v| v.as_array()) {
                    for row in rows {
                        if let Some(s) = row.as_str() {
                            if let Some(p) = parse_trend_point(s) {
                                points.push(p);
                            }
                        }
                    }
                }
                if !points.is_empty() {
                    days.push(DayTrend {
                        date: d_key,
                        pre_close,
                        points,
                    });
                }
            }
        }
    } else {
        return Err(parse_err("五日分时缺少合法的 data 数组或对象"));
    }

    if days.is_empty() {
        return Err(parse_err("腾讯五日分时数据为空"));
    }

    Ok(MultiDayTrend {
        code: code.to_string(),
        days,
    })
}

#[derive(Deserialize)]
struct SinaBar {
    day: String,
    #[serde(default)]
    open: String,
    #[serde(default)]
    close: String,
    #[serde(default)]
    volume: String,
    #[serde(default)]
    amount: String,
}

/// Parse Sina's 1-minute candlestick array grouped by trading day into a 5-day trend.
pub fn parse_sina_multi_trend(code: &str, bytes: &[u8]) -> Result<MultiDayTrend, FetchError> {
    let text = String::from_utf8_lossy(bytes);
    let bars: Vec<SinaBar> = serde_json::from_str(&text)
        .map_err(|e| parse_err(format!("新浪五日分时 JSON 解析失败: {e}")))?;

    if bars.is_empty() {
        return Err(parse_err("新浪未返回分时数据"));
    }

    let mut day_groups: BTreeMap<String, Vec<&SinaBar>> = BTreeMap::new();
    for b in &bars {
        let Some(day_str) = b.day.split(' ').next() else { continue };
        if day_str.len() == 10 {
            let clean_day = day_str.replace('-', "");
            day_groups.entry(clean_day).or_default().push(b);
        }
    }

    if day_groups.is_empty() {
        return Err(parse_err("新浪五日分时日期解析失败"));
    }

    // Keep the most recent 5 days
    let recent_keys: Vec<String> = day_groups.keys().rev().take(5).cloned().collect();
    let mut sorted_keys = recent_keys;
    sorted_keys.reverse();

    let mut days = Vec::with_capacity(sorted_keys.len());
    let mut prev_day_close: Option<f64> = None;

    for key in sorted_keys {
        let Some(day_bars) = day_groups.get(&key) else { continue };
        if day_bars.is_empty() {
            continue;
        }

        let mut points = Vec::with_capacity(day_bars.len() + 1);
        let mut cum_volume = 0.0;
        let mut cum_amount = 0.0;

        for bar in day_bars {
            let Some(time_part) = bar.day.split(' ').nth(1) else { continue };
            let mut parts = time_part.split(':');
            let Some(h) = parts.next().and_then(|s| s.parse::<u32>().ok()) else { continue };
            let Some(m) = parts.next().and_then(|s| s.parse::<u32>().ok()) else { continue };
            let hhmm = h * 100 + m;

            let price = num(&bar.close);
            if price <= 0.0 {
                continue;
            }
            cum_volume += num(&bar.volume) / 100.0;
            cum_amount += num(&bar.amount);
            points.push(make_point(hhmm, price, cum_volume, cum_amount));
        }

        if points.is_empty() {
            continue;
        }

        if points[0].time == 931 {
            let open_price = num(&day_bars[0].open);
            if open_price > 0.0 {
                points.insert(0, make_point(930, open_price, 0.0, 0.0));
            }
        }

        let pre_close = prev_day_close.unwrap_or_else(|| num(&day_bars[0].open));
        let last_close = num(&day_bars.last().unwrap().close);
        if last_close > 0.0 {
            prev_day_close = Some(last_close);
        }

        days.push(DayTrend {
            date: key,
            pre_close,
            points,
        });
    }

    if days.is_empty() {
        return Err(parse_err("解析出的新浪五日分时数据为空"));
    }

    Ok(MultiDayTrend {
        code: code.to_string(),
        days,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tencent_multi_trend() {
        let json = r#"{
            "code": 0,
            "msg": "",
            "data": {
                "sh600000": {
                    "data": {
                        "20261105": {
                            "data": ["0930 10.00 100 100000.00", "0931 10.05 200 201000.00"],
                            "date": "20261105",
                            "prec": "9.95"
                        },
                        "20261106": {
                            "data": ["0930 10.10 150 151500.00", "0931 10.15 250 253750.00"],
                            "date": "20261106",
                            "prec": "10.05"
                        }
                    }
                }
            }
        }"#;

        let res = parse_tencent_multi_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(res.code, "sh600000");
        assert_eq!(res.days.len(), 2);
        assert_eq!(res.days[0].date, "20261105");
        assert_eq!(res.days[0].pre_close, 9.95);
        assert_eq!(res.days[0].points.len(), 2);
        assert_eq!(res.days[1].date, "20261106");
        assert_eq!(res.days[1].pre_close, 10.05);
    }

    #[test]
    fn test_parse_tencent_multi_trend_array() {
        let json = r#"{"code":0,"msg":"","data":{"sh600000":{"data":[
            {"date":"20261106","data":["0930 10.10 150 151500.00"],"prec":"10.05"},
            {"date":"20261105","data":["0930 10.00 100 100000.00"],"prec":"9.95"}
        ]}}}"#;
        let res = parse_tencent_multi_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(res.days.len(), 2);
        assert_eq!(res.days[0].date, "20261105");
        assert_eq!(res.days[1].date, "20261106");
    }

    #[test]
    fn test_parse_sina_multi_trend() {
        let json = r#"[
            {"day":"2026-11-05 09:31:00","open":"10.00","close":"10.05","volume":"10000","amount":"100500"},
            {"day":"2026-11-05 15:00:00","open":"10.05","close":"10.10","volume":"20000","amount":"202000"},
            {"day":"2026-11-06 09:31:00","open":"10.10","close":"10.15","volume":"15000","amount":"152250"}
        ]"#;

        let res = parse_sina_multi_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(res.code, "sh600000");
        assert_eq!(res.days.len(), 2);
        assert_eq!(res.days[0].date, "20261105");
        assert_eq!(res.days[1].date, "20261106");
        assert_eq!(res.days[1].pre_close, 10.10); // 上一日收盘价
    }
}
