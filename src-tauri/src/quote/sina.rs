use super::types::*;
use serde::Deserialize;

pub const QUOTE_ENDPOINT: &str = "https://hq.sinajs.cn/list=";
pub const TREND_ENDPOINT: &str = "https://quotes.sina.cn/cn/api/json_v2.php/\
                                  CN_MarketDataService.getKLineData";
pub const KLINE_ENDPOINT: &str = "https://quotes.sina.cn/cn/api/json_v2.php/\
                                  CN_MarketDataService.getKLineData";
/// Sina rejects requests without a matching referer.
pub const REFERER: &str = "https://finance.sina.com.cn";
/// One minute per bar. Ask for more than a session so the series is complete
/// even right after the open, then keep only the most recent day.
const TREND_DATALEN: u32 = 300;

pub fn quote_url(codes: &[String]) -> String {
    format!("{QUOTE_ENDPOINT}{}", codes.join(","))
}

pub fn trend_url(code: &str) -> String {
    format!("{TREND_ENDPOINT}?symbol={code}&scale=1&ma=no&datalen={TREND_DATALEN}")
}

pub fn kline_url(code: &str) -> String {
    format!("{KLINE_ENDPOINT}?symbol={code}&scale=240&ma=no&datalen=320")
}

/// Parse `var hq_str_sh600000="浦发银行,9.450,9.480,...";` lines.
pub fn parse_quotes(body: &str) -> Vec<Quote> {
    body.lines().filter_map(parse_quote_line).collect()
}

/// Sina field layout (comma separated):
pub fn parse_quote_line(line: &str) -> Option<Quote> {
    let line = line.trim();
    let rest = line.strip_prefix("var hq_str_")?;
    let (name_part, payload) = rest.split_once('=')?;

    // `hq_str_sh600000` -> the variable name carries the market prefix.
    let code = name_part.trim().to_ascii_lowercase();
    if code.is_empty() {
        return None;
    }

    let payload = payload.trim().trim_start_matches('"').trim_end_matches(['"', ';']);
    if payload.is_empty() {
        return None;
    }
    let f: Vec<&str> = payload.split(',').collect();
    // We read up to index 31.
    if f.len() < 32 {
        return None;
    }

    let price = num(f[3]);
    let pre_close = num(f[2]);
    // A suspended security reports 0.00 for everything; keep it out rather
    // than showing a fake -100% move.
    if price <= 0.0 || pre_close <= 0.0 {
        return None;
    }

    let change = price - pre_close;
    let change_pct = if pre_close > 0.0 { change / pre_close * 100.0 } else { 0.0 };

    // Shares -> 手.
    let mut volume = num(f[8]) / 100.0;
    // During call auction (09:15-09:24), executed cumulative volume is 0 until 09:25 open match.
    // Buy 1 volume (f[10]) and Sell 1 volume (f[20]) carry the matching / order intent lots.
    if volume <= 0.0 && f.len() > 20 {
        let b1_v = num(f[10]) / 100.0;
        let a1_v = num(f[20]) / 100.0;
        let intent_vol = b1_v.max(a1_v);
        if intent_vol > 0.0 {
            volume = intent_vol;
        }
    }

    let mut bids = Vec::with_capacity(5);
    if f.len() > 19 {
        let b_tuples = [
            (num(f[11]), num(f[10]) / 100.0),
            (num(f[13]), num(f[12]) / 100.0),
            (num(f[15]), num(f[14]) / 100.0),
            (num(f[17]), num(f[16]) / 100.0),
            (num(f[19]), num(f[18]) / 100.0),
        ];
        for b in b_tuples {
            if b.0 > 0.0 || b.1 > 0.0 {
                bids.push(b);
            }
        }
    }

    let mut asks = Vec::with_capacity(5);
    if f.len() > 29 {
        let a_tuples = [
            (num(f[21]), num(f[20]) / 100.0),
            (num(f[23]), num(f[22]) / 100.0),
            (num(f[25]), num(f[24]) / 100.0),
            (num(f[27]), num(f[26]) / 100.0),
            (num(f[29]), num(f[28]) / 100.0),
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

    let outer_vol = 0.0;
    let inner_vol = 0.0;
    let active_buy_ratio = 0.5;

    Some(Quote {
        code,
        name: f[0].trim().to_string(),
        price,
        pre_close,
        open: num(f[1]),
        high: num(f[4]),
        low: num(f[5]),
        volume,
        change,
        change_pct,
        // `2026-10-08` -> `20261008`.
        date: f[30].trim().replace('-', ""),
        time: f[31].trim().to_string(),
        bids,
        asks,
        outer_vol,
        inner_vol,
        bid_ask_imbalance,
        active_buy_ratio,
    })
}

#[derive(Deserialize)]
struct Bar {
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

/// Parse the `getKLineData` JSON array.
pub fn parse_trend(code: &str, bytes: &[u8]) -> Result<Trend, FetchError> {
    let text = String::from_utf8_lossy(bytes);
    let bars: Vec<Bar> = serde_json::from_str(&text)
        .map_err(|e| parse_err(format!("新浪分时 JSON 解析失败: {e}")))?;
    if bars.is_empty() {
        return Err(parse_err(format!("新浪未返回 {code} 的分时数据")));
    }

    // Keep only the newest trading day present.
    let last_day = bars
        .iter()
        .filter_map(|b| day_of(&b.day))
        .max()
        .ok_or_else(|| parse_err("新浪分时缺少日期字段"))?;
    let today: Vec<&Bar> =
        bars.iter().filter(|b| day_of(&b.day).as_deref() == Some(last_day.as_str())).collect();
    if today.is_empty() {
        return Err(parse_err("新浪分时按日期过滤后为空"));
    }

    let mut points = Vec::with_capacity(today.len() + 1);
    let mut cum_volume = 0.0; // 手
    let mut cum_amount = 0.0; // 元

    for bar in &today {
        let Some(hhmm) = hhmm_of(&bar.day) else { continue };
        let price = num(&bar.close);
        if price <= 0.0 {
            continue;
        }
        cum_volume += num(&bar.volume) / 100.0;
        cum_amount += num(&bar.amount);
        points.push(make_point(hhmm, price, cum_volume, cum_amount));
    }

    if points.is_empty() {
        return Err(parse_err("新浪分时没有可用的分钟数据"));
    }

    // Prepend 09:30 open if missing
    if points[0].time == 931 {
        let day_open = num(&today[0].open);
        if day_open > 0.0 {
            points.insert(0, make_point(930, day_open, 0.0, 0.0));
        }
    }

    Ok(Trend { code: code.to_string(), date: last_day, pre_close: 0.0, points })
}

/// `2026-10-08 09:31:00` -> `20261008`.
fn day_of(day: &str) -> Option<String> {
    let d = day.split(' ').next()?;
    if d.len() != 10 {
        return None;
    }
    Some(d.replace('-', ""))
}

/// `2026-10-08 09:31:00` -> `931`.
fn hhmm_of(day: &str) -> Option<u32> {
    let t = day.split(' ').nth(1)?;
    let mut parts = t.split(':');
    let h: u32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    Some(h * 100 + m)
}

/// Parse the Sina daily candlestick JSON array.
pub fn parse_kline(code: &str, bytes: &[u8]) -> Result<Vec<KLineBar>, FetchError> {
    let text = String::from_utf8_lossy(bytes);
    let items: Vec<serde_json::Value> = serde_json::from_str(&text)
        .map_err(|e| parse_err(format!("新浪日K JSON 解析失败: {e}")))?;

    let mut bars = Vec::with_capacity(items.len());
    for item in items {
        let date = item.get("day").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let open = item.get("open").and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
        let close = item.get("close").and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
        let high = item.get("high").and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
        let low = item.get("low").and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0);
        let volume = item.get("volume").and_then(|v| v.as_str()).and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0) / 100.0;

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

    if bars.is_empty() {
        return Err(parse_err(format!("新浪 {code} 有效日K线数据为空")));
    }

    Ok(bars)
}
