//! Tonghuashun (同花顺) real-time intraday index trend parser.
//!
//! Provides genuine minute-by-minute index trend data, including the authentic
//! unweighted / leading yellow line (领先指标 / 等权指数).
//!
//! Endpoint:
//! `http://d.10jqka.com.cn/v6/time/{ths_code}/today.js` with `Referer: http://stockpage.10jqka.com.cn/`.

use super::types::{parse_err, FetchError, Trend, TrendPoint};

pub const REFERER: &str = "http://stockpage.10jqka.com.cn/";

/// Map a normalized A-share index code to its Tonghuashun time-series symbol.
pub fn to_ths_index_code(code: &str) -> Option<&'static str> {
    match code.trim().to_ascii_lowercase().as_str() {
        "sh000001" | "000001" => Some("hs_1A0001"),
        "sz399001" | "399001" => Some("hs_399001"),
        "sz399006" | "399006" => Some("hs_399006"),
        "sz399005" | "399005" => Some("hs_399005"),
        _ => None,
    }
}

pub fn trend_url(ths_code: &str) -> String {
    format!("http://d.10jqka.com.cn/v6/time/{ths_code}/today.js")
}

/// Parse the JSONP response from Tonghuashun:
/// `quotebridge_v6_time_hs_1A0001_today({"hs_1A0001":{...}})`
pub fn parse_index_trend(
    code: &str,
    ths_code: &str,
    text: &str,
    fallback_pre_close: f64,
) -> Result<Trend, FetchError> {
    let start = text.find('(').ok_or_else(|| parse_err("THS 分时缺少起始括号"))?;
    let end = text.rfind(')').ok_or_else(|| parse_err("THS 分时缺少结束括号"))?;
    if start >= end {
        return Err(parse_err("THS 分时 JSONP 边界无效"));
    }

    let json_slice = &text[start + 1..end];
    let root: serde_json::Value = serde_json::from_str(json_slice)
        .map_err(|e| parse_err(format!("THS 分时 JSON 解析失败: {e}")))?;

    let entry = root
        .get(ths_code)
        .ok_or_else(|| parse_err(format!("THS 响应缺少对象 {ths_code}")))?;

    let pre_close = entry
        .get("pre")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|&v| v > 0.0)
        .unwrap_or(fallback_pre_close);

    let date = entry
        .get("date")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    let raw_data = entry
        .get("data")
        .and_then(|v| v.as_str())
        .ok_or_else(|| parse_err("THS 响应缺少 data 字段"))?;

    let mut points = Vec::new();
    let mut cum_volume = 0.0;
    let mut cum_amount = 0.0;

    for row in raw_data.split(';') {
        let trimmed = row.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() < 4 {
            continue;
        }

        let time = match parts[0].parse::<u32>() {
            Ok(t) => t,
            Err(_) => continue,
        };

        let price = match parts[1].parse::<f64>() {
            Ok(p) => p,
            Err(_) => continue,
        };

        let minute_amount = parts[2].parse::<f64>().unwrap_or(0.0);
        let lead_price = parts[3].parse::<f64>().unwrap_or(price);
        cum_amount += minute_amount;

        if parts.len() > 4 {
            if let Ok(v) = parts[4].parse::<f64>() {
                cum_volume += v;
            }
        }

        points.push(TrendPoint {
            time,
            price,
            cum_volume,
            cum_amount,
            avg_price: lead_price,
        });
    }

    if points.is_empty() {
        return Err(parse_err("THS 分时未解析出有效分钟点"));
    }

    Ok(Trend {
        code: code.to_string(),
        date,
        pre_close,
        points,
    })
}

/// Fetch real-time intraday index trend with genuine yellow line directly from Tonghuashun.
pub async fn fetch_index_trend(
    client: &reqwest::Client,
    code: &str,
    fallback_pre_close: f64,
) -> Option<Trend> {
    let ths_code = to_ths_index_code(code)?;
    let url = trend_url(ths_code);
    let resp = client
        .get(&url)
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    let text = String::from_utf8_lossy(&bytes);
    parse_index_trend(code, ths_code, &text, fallback_pre_close).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_ths_index_code() {
        assert_eq!(to_ths_index_code("sh000001"), Some("hs_1A0001"));
        assert_eq!(to_ths_index_code("000001"), Some("hs_1A0001"));
        assert_eq!(to_ths_index_code("sz399001"), Some("hs_399001"));
        assert_eq!(to_ths_index_code("sz399006"), Some("hs_399006"));
        assert_eq!(to_ths_index_code("sz399005"), Some("hs_399005"));
        assert_eq!(to_ths_index_code("sh600000"), None);
        assert_eq!(to_ths_index_code("sz000001"), None);
    }

    #[test]
    fn test_parse_index_trend_golden() {
        let sample = r#"quotebridge_v6_time_hs_1A0001_today({"hs_1A0001":{"name":"上证指数","open":0,"stop":0,"isTrading":0,"pre":"3533.79","date":"20261123","data":"0930,3503.52,8350370900,3486.0838,673493100;1049,3481.84,1792250000,3452.5128,116828000;1500,3538.95,9477030000,3616.4807,691033000"}})"#;
        let trend = parse_index_trend("sh000001", "hs_1A0001", sample, 3500.0).expect("parse failed");

        assert_eq!(trend.code, "sh000001");
        assert_eq!(trend.date, "20261123");
        assert_eq!(trend.pre_close, 3533.79);
        assert_eq!(trend.points.len(), 3);

        // 09:30
        assert_eq!(trend.points[0].time, 930);
        assert_eq!(trend.points[0].price, 3503.52);
        assert_eq!(trend.points[0].avg_price, 3486.0838);

        // 10:49 morning dip
        assert_eq!(trend.points[1].time, 1049);
        assert_eq!(trend.points[1].price, 3481.84);
        assert_eq!(trend.points[1].avg_price, 3452.5128);

        // 15:00 afternoon close
        assert_eq!(trend.points[2].time, 1500);
        assert_eq!(trend.points[2].price, 3538.95);
        assert_eq!(trend.points[2].avg_price, 3616.4807);
    }
}
