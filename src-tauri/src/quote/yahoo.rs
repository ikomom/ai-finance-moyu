use chrono::DateTime;
use serde::Deserialize;

use super::types::*;

#[derive(Deserialize)]
struct YahooChartResponse {
    chart: YahooChartBody,
}

#[derive(Deserialize)]
struct YahooChartBody {
    result: Option<Vec<YahooChartResult>>,
}

#[derive(Deserialize)]
struct YahooChartResult {
    meta: Option<YahooMeta>,
    timestamp: Option<Vec<i64>>,
    indicators: Option<YahooIndicators>,
}

#[derive(Deserialize, Default)]
#[allow(dead_code)]
struct YahooMeta {
    #[serde(rename = "previousClose")]
    previous_close: Option<f64>,
    #[serde(rename = "chartPreviousClose")]
    chart_previous_close: Option<f64>,
    #[serde(rename = "regularMarketPrice")]
    regular_market_price: Option<f64>,
    gmtoffset: Option<i64>,
    timezone: Option<String>,
}

#[derive(Deserialize)]
struct YahooIndicators {
    quote: Option<Vec<YahooQuoteData>>,
}

#[derive(Deserialize)]
struct YahooQuoteData {
    open: Option<Vec<Option<f64>>>,
    high: Option<Vec<Option<f64>>>,
    low: Option<Vec<Option<f64>>>,
    close: Option<Vec<Option<f64>>>,
    volume: Option<Vec<Option<f64>>>,
}

pub fn parse_yahoo_trend(code: &str, bytes: &[u8]) -> Result<Trend, FetchError> {
    let resp: YahooChartResponse = serde_json::from_slice(bytes)
        .map_err(|e| parse_err(format!("Yahoo Finance 分时 JSON解析失败: {e}")))?;

    let result = resp
        .chart
        .result
        .and_then(|r| r.into_iter().next())
        .ok_or_else(|| parse_err("Yahoo Finance 未返回有效分时图表数据"))?;

    let meta = result.meta.unwrap_or_default();
    let pre_close = meta.previous_close
        .or(meta.chart_previous_close)
        .unwrap_or(0.0);
    let gmtoffset = meta.gmtoffset.unwrap_or(0);

    let timestamps = result.timestamp.unwrap_or_default();
    let quote_data = result
        .indicators
        .and_then(|ind| ind.quote)
        .and_then(|q| q.into_iter().next())
        .ok_or_else(|| parse_err("Yahoo Finance 缺少分时指标数据"))?;

    let closes = quote_data.close.unwrap_or_default();
    let volumes = quote_data.volume.unwrap_or_default();
    let n = timestamps.len();

    let mut points = Vec::with_capacity(n);
    let mut cum_volume = 0.0;
    let mut prev_price = if pre_close > 0.0 { pre_close } else { 0.0 };
    let mut date_str = String::new();

    for i in 0..n {
        let ts = timestamps[i];
        let price = match closes.get(i).copied().flatten() {
            Some(p) if p > 0.0 => {
                prev_price = p;
                p
            }
            _ => {
                if prev_price > 0.0 { prev_price } else { continue; }
            }
        };

        let vol = volumes.get(i).copied().flatten().unwrap_or(0.0);
        cum_volume += vol;

        let local_ts = ts + gmtoffset;
        if date_str.is_empty() {
            if let Some(dt) = DateTime::from_timestamp(local_ts, 0) {
                date_str = dt.format("%Y%m%d").to_string();
            }
        }

        let seconds_in_day = local_ts.rem_euclid(86400);
        let hour = (seconds_in_day / 3600) as u32;
        let min = ((seconds_in_day % 3600) / 60) as u32;
        let time = hour * 100 + min;

        points.push(TrendPoint {
            time,
            price,
            cum_volume,
            cum_amount: 0.0,
            avg_price: 0.0,
        });
    }

    if points.is_empty() {
        return Err(parse_err(format!("{code} 有效分时数据为空")));
    }

    let actual_pre_close = if pre_close > 0.0 {
        pre_close
    } else {
        points.first().map(|p| p.price).unwrap_or(0.0)
    };

    Ok(Trend {
        code: code.to_string(),
        date: date_str,
        pre_close: actual_pre_close,
        points,
    })
}

pub fn global_code_to_yahoo_symbol(code: &str) -> Option<&'static str> {
    let clean = code.trim();
    match clean.to_ascii_uppercase().as_str() {
        "USIXIC" | "IXIC" | ".IXIC" => Some("^IXIC"),
        "USDJI" | "DJI" | ".DJI" => Some("^DJI"),
        "USINX" | "INX" | ".INX" => Some("^GSPC"),
        "HKHSI" | "HSI" => Some("^HSI"),
        "GZN225" | "N225" => Some("^N225"),
        "GZKS11" | "KS11" => Some("^KS11"),
        "GZFTSE" | "FTSE" => Some("^FTSE"),
        s if s.starts_with('^') => None,
        _ => None,
    }
}

pub fn parse_yahoo_chart(code: &str, bytes: &[u8]) -> Result<Vec<KLineBar>, FetchError> {
    let resp: YahooChartResponse = serde_json::from_slice(bytes)
        .map_err(|e| parse_err(format!("Yahoo Finance K线 JSON解析失败: {e}")))?;

    let result = resp
        .chart
        .result
        .and_then(|r| r.into_iter().next())
        .ok_or_else(|| parse_err("Yahoo Finance 未返回有效图表数据"))?;

    let timestamps = result.timestamp.unwrap_or_default();
    let quote_data = result
        .indicators
        .and_then(|ind| ind.quote)
        .and_then(|q| q.into_iter().next())
        .ok_or_else(|| parse_err("Yahoo Finance 缺少K线指标数据"))?;

    let opens = quote_data.open.unwrap_or_default();
    let highs = quote_data.high.unwrap_or_default();
    let lows = quote_data.low.unwrap_or_default();
    let closes = quote_data.close.unwrap_or_default();
    let volumes = quote_data.volume.unwrap_or_default();

    let n = timestamps.len();
    let mut bars = Vec::with_capacity(n);

    for i in 0..n {
        let ts = timestamps[i];
        let Some(open) = opens.get(i).copied().flatten() else { continue; };
        let Some(high) = highs.get(i).copied().flatten() else { continue; };
        let Some(low) = lows.get(i).copied().flatten() else { continue; };
        let Some(close) = closes.get(i).copied().flatten() else { continue; };
        let volume = volumes.get(i).copied().flatten().unwrap_or(0.0);

        if open <= 0.0 || high <= 0.0 || low <= 0.0 || close <= 0.0 {
            continue;
        }

        let date = DateTime::from_timestamp(ts, 0)
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_default();

        if date.is_empty() {
            continue;
        }

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
        });
    }

    if bars.is_empty() {
        return Err(parse_err(format!("{code} 有效日K线数据为空")));
    }

    Ok(bars)
}
