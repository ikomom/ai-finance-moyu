use super::types::*;
use serde::Deserialize;

pub const QUOTE_ENDPOINT: &str = "https://qt.gtimg.cn/q=";
pub const TREND_ENDPOINT: &str =
    "https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=";
pub const KLINE_ENDPOINT: &str =
    "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=";

pub fn quote_url(codes: &[String]) -> String {
    format!("{QUOTE_ENDPOINT}{}", codes.join(","))
}

pub fn trend_url(code: &str) -> String {
    format!("{TREND_ENDPOINT}{code}")
}

pub fn kline_url(code: &str) -> String {
    format!("{KLINE_ENDPOINT}{code},day,,,320,qfq")
}

/// Parse the `v_<code>="f0~f1~f2~...";` lines.
pub fn parse_quotes(body: &str) -> Vec<Quote> {
    body.lines().filter_map(parse_quote_line).collect()
}

/// Parse one `v_<code>="..."` line. Returns `None` for blank lines and for
/// codes the server rejected (it answers with an empty payload).
pub fn parse_quote_line(line: &str) -> Option<Quote> {
    let line = line.trim();
    let rest = line.strip_prefix("v_")?;
    let (name_part, payload) = rest.split_once('=')?;

    // The variable name is the only place the market prefix survives.
    let code = name_part.trim().to_ascii_lowercase();

    let payload = payload.trim().trim_start_matches('"').trim_end_matches(['"', ';']);
    if payload.is_empty() {
        return None;
    }
    let f: Vec<&str> = payload.split('~').collect();
    // Fields we read top out at index 34; anything shorter is a bad payload.
    if f.len() < 35 {
        return None;
    }

    let time = f[30].trim().to_string();
    let date = if time.len() >= 8 { time[..8].to_string() } else { String::new() };

    let mut volume = num(f[6]);
    // During call auction (09:15-09:24), executed cumulative volume is 0 until 09:25 open match.
    // Buy 1 volume (f[10]) and Sell 1 volume (f[20]) carry the matching / order intent lots.
    if volume <= 0.0 && f.len() > 20 {
        let b1_v = num(f[10]);
        let a1_v = num(f[20]);
        let intent_vol = b1_v.max(a1_v);
        if intent_vol > 0.0 {
            volume = intent_vol;
        }
    }

    let outer_vol = if f.len() > 7 { num(f[7]) } else { 0.0 };
    let inner_vol = if f.len() > 8 { num(f[8]) } else { 0.0 };

    let mut bids = Vec::with_capacity(5);
    if f.len() > 18 {
        let b_tuples = [
            (num(f[9]), num(f[10])),
            (num(f[11]), num(f[12])),
            (num(f[13]), num(f[14])),
            (num(f[15]), num(f[16])),
            (num(f[17]), num(f[18])),
        ];
        for b in b_tuples {
            if b.0 > 0.0 || b.1 > 0.0 {
                bids.push(b);
            }
        }
    }

    let mut asks = Vec::with_capacity(5);
    if f.len() > 28 {
        let a_tuples = [
            (num(f[19]), num(f[20])),
            (num(f[21]), num(f[22])),
            (num(f[23]), num(f[24])),
            (num(f[25]), num(f[26])),
            (num(f[27]), num(f[28])),
        ];
        for a in a_tuples {
            if a.0 > 0.0 || a.1 > 0.0 {
                asks.push(a);
            }
        }
    }

    let sum_bid: f64 = bids.iter().map(|b| b.1).sum();
    let sum_ask: f64 = asks.iter().map(|a| a.1).sum();
    let bid_ask_imbalance = if sum_bid + sum_ask > 0.0 {
        ((sum_bid - sum_ask) / (sum_bid + sum_ask) * 1000.0).round() / 1000.0
    } else {
        0.0
    };

    let active_buy_ratio = if outer_vol + inner_vol > 0.0 {
        ((outer_vol / (outer_vol + inner_vol)) * 1000.0).round() / 1000.0
    } else {
        0.5
    };

    Some(Quote {
        code,
        name: f[1].trim().to_string(),
        price: num(f[3]),
        pre_close: num(f[4]),
        open: num(f[5]),
        // Tencent already reports 手.
        volume,
        change: num(f[31]),
        change_pct: num(f[32]),
        high: num(f[33]),
        low: num(f[34]),
        date,
        time,
        bids,
        asks,
        outer_vol,
        inner_vol,
        bid_ask_imbalance,
        active_buy_ratio,
    })
}

#[derive(Deserialize)]
struct TrendEnvelope {
    code: i32,
    #[serde(default)]
    data: serde_json::Value,
}

/// Parse the `appstock/app/minute/query` JSON envelope.
pub fn parse_trend(code: &str, bytes: &[u8]) -> Result<Trend, FetchError> {
    // This endpoint answers in UTF-8 (it is JSON).
    let text = String::from_utf8_lossy(bytes);
    let env: TrendEnvelope = serde_json::from_str(&text)
        .map_err(|e| parse_err(format!("分时 JSON 解析失败: {e}")))?;

    if env.code != 0 {
        return Err(parse_err(format!("接口返回 code={}", env.code)));
    }

    let entry = env
        .data
        .get(code)
        .ok_or_else(|| parse_err(format!("响应中缺少 {code} 的数据")))?;

    let date = entry
        .pointer("/data/date")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();

    let pre_close = entry
        .pointer(&format!("/qt/{code}"))
        .and_then(|v| v.as_array())
        .and_then(|a| a.get(4))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    let mut points = Vec::new();
    if let Some(rows) = entry.pointer("/data/data").and_then(|v| v.as_array()) {
        for row in rows {
            if let Some(s) = row.as_str() {
                if let Some(p) = parse_trend_point(s) {
                    points.push(p);
                }
            }
        }
    }

    Ok(Trend { code: code.to_string(), date, pre_close, points })
}

/// Parse one `"0930 9.45 4515 4266675.00"` row:
/// `HHMM  price  cumulative-volume(手)  cumulative-amount(元)`.
pub fn parse_trend_point(row: &str) -> Option<TrendPoint> {
    let mut it = row.split_whitespace();
    let time_raw = it.next()?;
    let price = it.next()?.parse::<f64>().ok()?;
    let cum_volume = it.next().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
    let cum_amount = it.next().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);

    let time = time_raw.parse::<u32>().ok()?;
    Some(make_point(time, price, cum_volume, cum_amount))
}

/// Parse the `appstock/app/fqkline/get` JSON envelope for daily candlestick series.
pub fn parse_kline(code: &str, bytes: &[u8]) -> Result<Vec<KLineBar>, FetchError> {
    let text = String::from_utf8_lossy(bytes);
    let env: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| parse_err(format!("腾讯日K JSON 解析失败: {e}")))?;

    if env.get("code").and_then(|c| c.as_i64()).unwrap_or(-1) != 0 {
        return Err(parse_err("腾讯日K接口返回错误状态"));
    }

    let entry = env
        .get("data")
        .and_then(|d| d.get(code))
        .ok_or_else(|| parse_err(format!("响应中缺少 {code} 的K线数据")))?;

    // Try qfqday first (forward-adjusted for stocks), fall back to day (indices or unadjusted)
    let rows = entry
        .get("qfqday")
        .or_else(|| entry.get("day"))
        .and_then(|v| v.as_array())
        .ok_or_else(|| parse_err(format!("{code} 未返回日K线数组")))?;

    let mut bars = Vec::with_capacity(rows.len());
    for row in rows {
        if let Some(arr) = row.as_array() {
            if arr.len() >= 6 {
                let date = arr[0].as_str().unwrap_or_default().to_string();
                let open = arr[1].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let close = arr[2].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let high = arr[3].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let low = arr[4].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
                let volume = arr[5].as_str().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);

                if open > 0.0 && close > 0.0 && high > 0.0 && low > 0.0 {
                    bars.push(KLineBar {
                        date,
                        open,
                        close,
                        high,
                        low,
                        volume,
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
            }
        }
    }

    if bars.is_empty() {
        return Err(parse_err(format!("{code} 有效日K线数据为空")));
    }

    Ok(bars)
}
