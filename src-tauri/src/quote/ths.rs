//! Tonghuashun (同花顺) real-time intraday index trend parser.
//!
//! Provides genuine minute-by-minute index trend data, including the authentic
//! unweighted / leading yellow line (领先指标 / 等权指数).
//!
//! Endpoint:
//! `http://d.10jqka.com.cn/v6/time/{ths_code}/today.js` with `Referer: http://stockpage.10jqka.com.cn/`.

use chrono::{NaiveDateTime, Timelike};

use super::trend_guard::{has_future_points_at, is_index_pre_close_mismatched};
use super::types::{parse_err, FetchError, Trend, TrendPoint};

pub const REFERER: &str = "http://stockpage.10jqka.com.cn/";

/// Ordered THS endpoint candidates `(object_key, url)` for an index.
///
/// THS shards (`v6/time/hs_*`, `v6/time/zs_*`, `v4/time/zs_*`) can roll at
/// different times right after market open (e.g. `hs_1A0001` temporarily
/// returning 242 previous-day points stamped with today's date, or `hs_399001`
/// returning 404). Trying validated fallback shards keeps the yellow lead line
/// live without accepting stale cross-day caches.
pub fn index_trend_candidates(code: &str) -> Vec<(String, String)> {
    let suffix = match code.trim().to_ascii_lowercase().as_str() {
        "sh000001" | "000001" => "1A0001",
        "sz399001" | "399001" => "399001",
        "sz399006" | "399006" => "399006",
        "sz399005" | "399005" => "399005",
        _ => return Vec::new(),
    };
    let hs = format!("hs_{suffix}");
    let zs = format!("zs_{suffix}");
    vec![
        (hs.clone(), format!("http://d.10jqka.com.cn/v6/time/{hs}/today.js")),
        (zs.clone(), format!("http://d.10jqka.com.cn/v6/time/{zs}/today.js")),
        (zs.clone(), format!("http://d.10jqka.com.cn/v4/time/{zs}/last.js")),
    ]
}

/// Parse and validate THS index JSONP against current Beijing time and live quote baseline.
pub fn parse_validated_index_trend(
    code: &str,
    ths_code: &str,
    text: &str,
    fallback_pre_close: f64,
    quote_date: &str,
    now: NaiveDateTime,
) -> Result<Trend, FetchError> {
    let (entry_pre, is_trading, trend) =
        parse_index_trend_inner(code, ths_code, text, fallback_pre_close)?;

    let can_check_pre =
        quote_date.is_empty() || trend.date.is_empty() || quote_date >= trend.date.as_str();
    if can_check_pre && is_index_pre_close_mismatched(code, entry_pre, fallback_pre_close) {
        return Err(parse_err(format!(
            "THS {ths_code} 昨收失配 (THS={entry_pre:.2}, 行情={fallback_pre_close:.2})"
        )));
    }

    if has_future_points_at(&trend, now) {
        return Err(parse_err(format!(
            "THS {ths_code} 分时含超前时间点（疑似跨日未重置缓存）"
        )));
    }

    let today_str = now.format("%Y%m%d").to_string();
    let session = crate::market::session_at(now);
    let now_min = (now.hour() * 60 + now.minute()) as i32;
    let last_min = trend
        .points
        .last()
        .map(|p| ((p.time / 100) * 60 + (p.time % 100)) as i32)
        .unwrap_or(0);
    if session.is_continuous_trading()
        && trend.date == today_str
        && is_trading == Some(0)
        && ((trend.points.len() >= 120 && now_min < 12 * 60) || last_min > now_min + 2)
    {
        return Err(parse_err(format!(
            "THS {ths_code} 盘中状态为未开盘(isTrading=0)且含历史全天点位"
        )));
    }

    Ok(trend)
}

fn parse_index_trend_inner(
    code: &str,
    ths_code: &str,
    text: &str,
    fallback_pre_close: f64,
) -> Result<(f64, Option<i64>, Trend), FetchError> {
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

    let raw_pre = entry
        .get("pre")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    let pre_close = if raw_pre > 0.0 { raw_pre } else { fallback_pre_close };
    let is_trading = entry.get("isTrading").and_then(|v| v.as_i64());

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

    Ok((
        raw_pre,
        is_trading,
        Trend {
            code: code.to_string(),
            date,
            pre_close,
            points,
        },
    ))
}

/// Fetch and validate THS intraday index trend across redundant shards (`v6/hs`, `v6/zs`, `v4/zs`).
pub async fn fetch_index_trend_for_quote(
    client: &reqwest::Client,
    code: &str,
    fallback_pre_close: f64,
    quote_date: &str,
) -> Option<Trend> {
    let candidates = index_trend_candidates(code);
    if candidates.is_empty() {
        return None;
    }
    let now = crate::market::beijing_now();
    for (ths_code, url) in candidates {
        let Ok(resp) = client
            .get(&url)
            .header(reqwest::header::REFERER, REFERER)
            .send()
            .await
        else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        let Ok(bytes) = resp.bytes().await else {
            continue;
        };
        let text = String::from_utf8_lossy(&bytes);
        match parse_validated_index_trend(
            code,
            &ths_code,
            &text,
            fallback_pre_close,
            quote_date,
            now,
        ) {
            Ok(trend) => return Some(trend),
            Err(e) => {
                log::debug!(target: "NET", "THS 候选分时淘汰 ({code} @ {url}): {e}");
            }
        }
    }
    None
}
