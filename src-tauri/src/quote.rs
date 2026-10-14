//! Quote fetching, from either Tencent or Sina.
//!
//! Both providers are public and key-free, both answer in **GB18030** rather
//! than UTF-8, and both accept a comma-separated code list so a whole watchlist
//! costs one request. They differ in field layout and in how the intraday series
//! is shaped, so each lives in its own module behind [`Fetcher`].
//!
//! Two things are easy to get wrong and are handled here:
//!
//! 1. **The responses are GB18030.** Decoding as UTF-8 turns every Chinese name
//!    into mojibake, so we take `bytes()` and run it through `encoding_rs`.
//! 2. **Tencent's code field drops the market prefix.** `sh000001` (上证指数)
//!    and `sz000001` (平安银行) both report `000001`, so we read the code from
//!    the response's *variable name* (`v_sh000001`), the only place the market
//!    is recorded. Sina's variable name carries the same information.
//!
//! The HTTP client bypasses any system proxy: this machine has `HTTP_PROXY` /
//! `HTTPS_PROXY` pointing at a local proxy, and `reqwest` honours those by
//! default, which would tunnel these domestic requests through it.

use std::time::Duration;

use encoding_rs::GB18030;
use serde::{Deserialize, Serialize};

use crate::config::DataSource;

/// Normalized across providers: volume is always in 手 (lots of 100 shares).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    /// Canonical prefixed code, e.g. `sh600000`.
    pub code: String,
    pub name: String,
    pub price: f64,
    pub pre_close: f64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    /// Cumulative volume in 手.
    pub volume: f64,
    pub change: f64,
    pub change_pct: f64,
    /// `YYYYMMDD`.
    pub date: String,
    /// Provider's own timestamp, e.g. `20261008104145` or `13:40:00`.
    pub time: String,
    /// 五档买盘: `[(price, volume_hands), ...]`, 1 到 5 档
    #[serde(default)]
    pub bids: Vec<(f64, f64)>,
    /// 五档卖盘: `[(price, volume_hands), ...]`, 1 到 5 档
    #[serde(default)]
    pub asks: Vec<(f64, f64)>,
    /// 外盘 (主动买量，手)
    #[serde(default)]
    pub outer_vol: f64,
    /// 内盘 (主动卖量，手)
    #[serde(default)]
    pub inner_vol: f64,
    /// 盘口买卖失衡度 `[-1.0, 1.0]`
    #[serde(default)]
    pub bid_ask_imbalance: f64,
    /// 主动买盘占比 `[0.0, 1.0]` (外盘 / (外盘 + 内盘))
    #[serde(default = "default_half")]
    pub active_buy_ratio: f64,
}

fn default_half() -> f64 {
    0.5
}

impl Default for Quote {
    fn default() -> Self {
        Self {
            code: String::new(),
            name: String::new(),
            price: 0.0,
            pre_close: 0.0,
            open: 0.0,
            high: 0.0,
            low: 0.0,
            volume: 0.0,
            change: 0.0,
            change_pct: 0.0,
            date: String::new(),
            time: String::new(),
            bids: Vec::new(),
            asks: Vec::new(),
            outer_vol: 0.0,
            inner_vol: 0.0,
            bid_ask_imbalance: 0.0,
            active_buy_ratio: 0.5,
        }
    }
}

/// One minute of the intraday series. Normalized so the two providers produce
/// identical values: cumulative volume in 手, cumulative amount in 元.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrendPoint {
    /// `HHMM` as a number, so `0930` becomes `930`.
    pub time: u32,
    pub price: f64,
    /// Cumulative, not per-minute.
    pub cum_volume: f64,
    /// Cumulative, not per-minute.
    pub cum_amount: f64,
    /// Derived: `cum_amount / (cum_volume * 100)`. Neither provider supplies a
    /// usable average, so it is always computed here.
    pub avg_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trend {
    pub code: String,
    /// Trading day the series belongs to, `YYYYMMDD`.
    pub date: String,
    pub pre_close: f64,
    pub points: Vec<TrendPoint>,
}

/// Single trading day bar in a daily candlestick series.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KLineBar {
    /// Date `YYYY-MM-DD` or `YYYYMMDD`.
    pub date: String,
    pub open: f64,
    pub close: f64,
    pub high: f64,
    pub low: f64,
    /// Trading volume in 手 (lots of 100 shares).
    pub volume: f64,
    pub ma5: Option<f64>,
    pub ma10: Option<f64>,
    pub ma20: Option<f64>,
    pub dif: Option<f64>,
    pub dea: Option<f64>,
    pub macd: Option<f64>,
}

/// Normalized daily K-line series with moving averages and diagnostic state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KLineData {
    pub code: String,
    pub bars: Vec<KLineBar>,
    /// Moving average state: "bull_aligned" | "above_ma20" | "below_ma20" | "bear_aligned" | "neutral"
    pub ma_signal: String,
    /// Detailed diagnostic comment
    pub ma_comment: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FetchErrorKind {
    Network,
    /// The server answered but we could not make sense of it.
    Parse,
}

#[derive(Debug, Clone)]
pub struct FetchError {
    pub kind: FetchErrorKind,
    pub message: String,
}

impl std::fmt::Display for FetchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl FetchError {
    /// Message prefixed with the failure category, so the status line tells the
    /// user whether reaching for the network cable would help.
    pub fn labelled(&self) -> String {
        match self.kind {
            FetchErrorKind::Network => format!("网络错误: {}", self.message),
            FetchErrorKind::Parse => format!("接口异常: {}", self.message),
        }
    }
}

impl std::error::Error for FetchError {}

fn net_err(e: impl std::fmt::Display) -> FetchError {
    FetchError { kind: FetchErrorKind::Network, message: e.to_string() }
}

fn parse_err(e: impl std::fmt::Display) -> FetchError {
    FetchError { kind: FetchErrorKind::Parse, message: e.to_string() }
}

/// Decode a provider response body. Both are GB18030; treating them as UTF-8
/// mangles every Chinese security name.
pub fn decode_gb18030(bytes: &[u8]) -> String {
    let (cow, _, _) = GB18030.decode(bytes);
    cow.into_owned()
}

/// Lenient float parse — feeds occasionally emit `-` or blank for a field.
fn num(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                          (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// =============================================================== Tencent

pub mod tencent {
    use super::*;

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
    ///
    /// ```jsonc
    /// { "code": 0,
    ///   "data": { "sh600000": {
    ///     "data": { "date": "20261008", "data": ["0930 9.45 4515 4266675.00", ...] },
    ///     "qt":   { "sh600000": [ ...quote fields... ] },
    ///     "mx_price": { "price": "", "mx": "" }   // always empty, unusable
    ///   } } }
    /// ```
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

        // 昨收 comes from the embedded quote block — field 4, same layout as the
        // batch endpoint.
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
}

// ================================================================== Sina

pub mod sina {
    use super::*;

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
    ///
    /// | idx | meaning |
    /// |-----|---------|
    /// | 0 | name |
    /// | 1 | open |
    /// | 2 | previous close |
    /// | 3 | current price |
    /// | 4 | high |
    /// | 5 | low |
    /// | 8 | volume, in **shares** |
    /// | 9 | amount, in 元 |
    /// | 30 | date `YYYY-MM-DD` |
    /// | 31 | time `HH:MM:SS` |
    ///
    /// Indices 10–29 are the five bid/ask levels. Volume is divided by 100 so it
    /// matches Tencent's 手.
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
    ///
    /// ```jsonc
    /// [ { "day": "2026-10-08 09:31:00", "open": "9.450", "high": "9.480",
    ///     "low": "9.420", "close": "9.470",
    ///     "volume": "2528454",   // shares, for THIS minute only
    ///     "amount": "23907838.4673" }, ... ]
    /// ```
    ///
    /// Two things need care:
    ///
    /// * The response spans **more than one trading day** (it is the last
    ///   `datalen` bars, not "today"), so it must be filtered to the most recent
    ///   day or the chart would splice two sessions together.
    /// * `volume`/`amount` are **per minute**, not cumulative like Tencent's, so
    ///   they are accumulated here to keep [`TrendPoint`] semantics identical.
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
            // Per-minute shares -> 手, accumulated into the cumulative series.
            cum_volume += num(&bar.volume) / 100.0;
            cum_amount += num(&bar.amount);
            points.push(make_point(hhmm, price, cum_volume, cum_amount));
        }

        if points.is_empty() {
            return Err(parse_err("新浪分时没有可用的分钟数据"));
        }

        // Sina's first bar is 09:31 — the 09:30 opening print is absent. The
        // first bar's `open` *is* the day's opening price, so prepend it to match
        // how A股 分时 charts are drawn (and to match Tencent, which includes it).
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
            // Sina volume is in shares -> 手
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
                });
            }
        }

        if bars.is_empty() {
            return Err(parse_err(format!("新浪 {code} 有效日K线数据为空")));
        }

        Ok(bars)
    }
}

/// Calculate rolling MA5, MA10, MA20, and MACD(12, 26, 9), and synthesize diagnostics.
pub fn compute_kline_indicators(code: &str, mut bars: Vec<KLineBar>) -> KLineData {
    let n = bars.len();
    for i in 0..n {
        if i + 1 >= 5 {
            let sum: f64 = bars[i + 1 - 5..=i].iter().map(|b| b.close).sum();
            bars[i].ma5 = Some((sum / 5.0 * 100.0).round() / 100.0);
        }
        if i + 1 >= 10 {
            let sum: f64 = bars[i + 1 - 10..=i].iter().map(|b| b.close).sum();
            bars[i].ma10 = Some((sum / 10.0 * 100.0).round() / 100.0);
        }
        if i + 1 >= 20 {
            let sum: f64 = bars[i + 1 - 20..=i].iter().map(|b| b.close).sum();
            bars[i].ma20 = Some((sum / 20.0 * 100.0).round() / 100.0);
        }
    }

    // MACD(12, 26, 9) standard exponential moving average recursion
    if n > 0 {
        let mut ema12 = bars[0].close;
        let mut ema26 = bars[0].close;
        let mut dea = 0.0;

        for i in 0..n {
            let c = bars[i].close;
            if i == 0 {
                ema12 = c;
                ema26 = c;
                dea = 0.0;
                bars[i].dif = Some(0.0);
                bars[i].dea = Some(0.0);
                bars[i].macd = Some(0.0);
            } else {
                ema12 = ema12 * (11.0 / 13.0) + c * (2.0 / 13.0);
                ema26 = ema26 * (25.0 / 27.0) + c * (2.0 / 27.0);
                let dif = ema12 - ema26;
                dea = dea * (8.0 / 10.0) + dif * (2.0 / 10.0);
                let macd_hist = (dif - dea) * 2.0;

                bars[i].dif = Some((dif * 1000.0).round() / 1000.0);
                bars[i].dea = Some((dea * 1000.0).round() / 1000.0);
                bars[i].macd = Some((macd_hist * 1000.0).round() / 1000.0);
            }
        }
    }

    let (ma_signal, ma_comment) = if let Some(last) = bars.last() {
        match (last.ma5, last.ma10, last.ma20) {
            (Some(m5), Some(m10), Some(m20)) => {
                let c = last.close;
                if m5 > m10 && m10 > m20 && c >= m5 {
                    (
                        "bull_aligned".to_string(),
                        format!("日线呈多头排列 (MA5 {:.2} > MA10 {:.2} > MA20 {:.2})，均线支撑强劲，多方趋势向好", m5, m10, m20),
                    )
                } else if c >= m20 && m5 >= m20 {
                    (
                        "above_ma20".to_string(),
                        format!("价格稳于生命线 MA20 ({:.2}) 上方，短线均线承托有效", m20),
                    )
                } else if m5 < m10 && m10 < m20 && c <= m5 {
                    (
                        "bear_aligned".to_string(),
                        format!("日线呈空头排列 (MA5 {:.2} < MA10 {:.2} < MA20 {:.2})，空头承压，谨慎追高", m5, m10, m20),
                    )
                } else if c < m20 {
                    (
                        "below_ma20".to_string(),
                        format!("价格受制于生命线 MA20 ({:.2})，短线承压偏弱蓄势", m20),
                    )
                } else {
                    (
                        "neutral".to_string(),
                        format!("价格在均线密集区震荡整理 (MA5 {:.2}, MA20 {:.2})", m5, m20),
                    )
                }
            }
            (Some(m5), Some(m10), None) => {
                if m5 >= m10 {
                    ("above_ma20".to_string(), format!("MA5 ({:.2}) 金叉上穿 MA10 ({:.2})", m5, m10))
                } else {
                    ("below_ma20".to_string(), format!("MA5 ({:.2}) 承压于 MA10 ({:.2})", m5, m10))
                }
            }
            _ => ("neutral".to_string(), "历史数据积累中，均线平稳观察".to_string()),
        }
    } else {
        ("neutral".to_string(), "暂无历史 K 线数据".to_string())
    };

    KLineData {
        code: code.to_string(),
        bars,
        ma_signal,
        ma_comment,
    }
}

/// Build a point, deriving 均价 from the cumulative totals.
///
/// A zero-volume point (Sina's synthesized 09:30 open) has no average yet, so it
/// falls back to the price rather than producing NaN.
fn make_point(time: u32, price: f64, cum_volume: f64, cum_amount: f64) -> TrendPoint {
    let avg_price = if cum_volume > 0.0 && cum_amount > 0.0 {
        let calc = cum_amount / (cum_volume * 100.0);
        // For indices (e.g. sh000001, sz399001), cumulative amount and volume
        // do not represent 100 shares per hand of a single stock. If calc
        // deviates wildly from price, do not emit an absurd average price.
        if price > 0.0 && (calc - price).abs() / price > 0.35 {
            0.0
        } else {
            calc
        }
    } else {
        price
    };
    TrendPoint { time, price, cum_volume, cum_amount, avg_price }
}

// =============================================================== Fetcher

pub const QUOTE_CHUNK_SIZE: usize = 50;

#[derive(Clone)]
pub struct Fetcher {
    client: reqwest::Client,
}

impl Fetcher {
    pub fn new() -> Result<Self, FetchError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(8))
            .connect_timeout(Duration::from_secs(5))
            .user_agent(USER_AGENT)
            .build()
            .map_err(net_err)?;
        Ok(Self { client })
    }

    /// One request for any number of codes — both providers accept a code list.
    ///
    /// When there are many codes, requests are chunked in batches of up to 50
    /// to avoid URL query length limits on CDN endpoints, fetched concurrently.
    ///
    /// If the primary provider fails due to a network or endpoint error,
    /// automatically fall back to the secondary provider before returning an error.
    pub async fn fetch_quotes(
        &self,
        source: DataSource,
        codes: &[String],
    ) -> Result<Vec<Quote>, FetchError> {
        if codes.is_empty() {
            return Ok(Vec::new());
        }

        if codes.len() <= QUOTE_CHUNK_SIZE {
            return self.fetch_quotes_chunk(source, codes).await;
        }

        let mut handles = Vec::new();
        for chunk in codes.chunks(QUOTE_CHUNK_SIZE) {
            let fetcher = self.clone();
            let chunk_codes = chunk.to_vec();
            handles.push(tokio::spawn(async move {
                fetcher.fetch_quotes_chunk(source, &chunk_codes).await
            }));
        }

        let mut all_quotes = Vec::with_capacity(codes.len());
        let mut first_err = None;
        for handle in handles {
            match handle.await {
                Ok(Ok(quotes)) => all_quotes.extend(quotes),
                Ok(Err(e)) => {
                    if first_err.is_none() {
                        first_err = Some(e);
                    }
                }
                Err(e) => {
                    if first_err.is_none() {
                        first_err = Some(net_err(e));
                    }
                }
            }
        }

        if all_quotes.is_empty() && first_err.is_some() {
            return Err(first_err.unwrap());
        }

        Ok(all_quotes)
    }

    async fn fetch_quotes_chunk(
        &self,
        source: DataSource,
        codes: &[String],
    ) -> Result<Vec<Quote>, FetchError> {
        match self.fetch_quotes_direct(source, codes).await {
            Ok(quotes) if !quotes.is_empty() => Ok(quotes),
            Ok(quotes) => Ok(quotes),
            Err(primary_err) => {
                let fallback = match source {
                    DataSource::Tencent => DataSource::Sina,
                    DataSource::Sina => DataSource::Tencent,
                };
                match self.fetch_quotes_direct(fallback, codes).await {
                    Ok(quotes) => Ok(quotes),
                    Err(_) => Err(primary_err),
                }
            }
        }
    }

    async fn fetch_quotes_direct(
        &self,
        source: DataSource,
        codes: &[String],
    ) -> Result<Vec<Quote>, FetchError> {
        let (url, referer) = match source {
            DataSource::Tencent => (tencent::quote_url(codes), None),
            DataSource::Sina => (sina::quote_url(codes), Some(sina::REFERER)),
        };
        let bytes = self.get_bytes(&url, referer).await?;
        Ok(match source {
            DataSource::Tencent => tencent::parse_quotes(&decode_gb18030(&bytes)),
            DataSource::Sina => sina::parse_quotes(&decode_gb18030(&bytes)),
        })
    }

    /// Intraday series for a single code. If the primary provider fails,
    /// automatically falls back to the secondary provider.
    pub async fn fetch_trend(
        &self,
        source: DataSource,
        code: &str,
        pre_close: f64,
    ) -> Result<Trend, FetchError> {
        match self.fetch_trend_direct(source, code, pre_close).await {
            Ok(trend) => Ok(trend),
            Err(primary_err) => {
                let fallback = match source {
                    DataSource::Tencent => DataSource::Sina,
                    DataSource::Sina => DataSource::Tencent,
                };
                match self.fetch_trend_direct(fallback, code, pre_close).await {
                    Ok(trend) => Ok(trend),
                    Err(_) => Err(primary_err),
                }
            }
        }
    }

    async fn fetch_trend_direct(
        &self,
        source: DataSource,
        code: &str,
        pre_close: f64,
    ) -> Result<Trend, FetchError> {
        let (url, referer) = match source {
            DataSource::Tencent => (tencent::trend_url(code), None),
            DataSource::Sina => (sina::trend_url(code), Some(sina::REFERER)),
        };
        let bytes = self.get_bytes(&url, referer).await?;
        let mut trend = match source {
            DataSource::Tencent => tencent::parse_trend(code, &bytes)?,
            DataSource::Sina => sina::parse_trend(code, &bytes)?,
        };
        if trend.pre_close <= 0.0 {
            trend.pre_close = pre_close;
        }
        Ok(trend)
    }

    async fn get_bytes(&self, url: &str, referer: Option<&str>) -> Result<Vec<u8>, FetchError> {
        let mut last_err = None;
        for attempt in 0..2 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(250)).await;
            }
            let mut req = self.client.get(url);
            if let Some(r) = referer {
                req = req.header(reqwest::header::REFERER, r);
            }
            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if !status.is_success() {
                        last_err = Some(FetchError {
                            kind: FetchErrorKind::Network,
                            message: format!("HTTP {status}"),
                        });
                        continue;
                    }
                    match resp.bytes().await {
                        Ok(b) => return Ok(b.to_vec()),
                        Err(e) => {
                            last_err = Some(net_err(e));
                        }
                    }
                }
                Err(e) => {
                    last_err = Some(net_err(e));
                }
            }
        }
        Err(last_err.unwrap_or_else(|| net_err("网络请求失败")))
    }

    /// Fetch daily candlestick series with forward adjustment (QFQ) and moving averages.
    ///
    /// Tries Tencent's forward-adjusted endpoint first, then falls back to Sina if unavailable.
    pub async fn fetch_kline(&self, code: &str) -> Result<KLineData, FetchError> {
        let tencent_url = tencent::kline_url(code);
        match self.get_bytes(&tencent_url, None).await {
            Ok(bytes) => {
                if let Ok(bars) = tencent::parse_kline(code, &bytes) {
                    return Ok(compute_kline_indicators(code, bars));
                }
            }
            Err(_) => {}
        }

        let sina_url = sina::kline_url(code);
        let bytes = self.get_bytes(&sina_url, Some(sina::REFERER)).await?;
        let bars = sina::parse_kline(code, &bytes)?;
        Ok(compute_kline_indicators(code, bars))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------------------------------------------------------- Tencent

    /// The `qt.gtimg.cn` response for `sh600000`, copied **byte-for-byte** from
    /// a live capture on 2026-10-08. Verbatim rather than reconstructed, so the
    /// field indices the parser relies on are pinned to what the server sends.
    ///
    /// Two details worth not "tidying": the payload has **88** fields, and index
    /// **29 is empty** (`...9.63~5436~~20261008104145~...`).
    const TENCENT_QUOTE_LINE: &str = "v_sh600000=\"1~浦发银行~600000~9.58~9.48~9.45~370939~200763~170143~9.58~838~9.57~2488~9.56~2422~9.55~7581~9.54~697~9.59~12062~9.60~16675~9.61~5938~9.62~4625~9.63~5436~~20261008104145~0.10~1.05~9.59~9.41~9.58/370939/353156021~370939~35316~0.11~6.23~~9.59~9.41~1.90~3190.70~3190.70~0.42~10.43~8.53~1.37~-30710~9.52~5.15~6.38~~~0.01~35315.6021~0.0000~0~   A~GP-A~-20.30~6.68~4.38~6.14~0.50~13.11~8.07~5.27~3.23~11.66~33305838300~33305838300~-52.26~-17.27~33305838300~~~-16.55~0.00~~CNY~0~___D__F__N~9.68~-4889~\";";

    /// Build a filler line with the same 88 fields as the live payload, so a
    /// server-side layout change keeps showing up here.
    fn synth_line(varname: &str, name: &str, code: &str, price: &str, pre_close: &str) -> String {
        let mut f = vec!["0".to_string(); 88];
        f[0] = "1".into();
        f[1] = name.into();
        f[2] = code.into();
        f[3] = price.into();
        f[4] = pre_close.into();
        f[5] = price.into();
        f[29] = String::new(); // matches the live payload's empty field
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

    /// The reason `parse_quote_line` reads the variable name instead of the
    /// payload's code field. Verified live: `sh000001` (上证指数) and
    /// `sz000001` (平安银行) both report `000001`, at different prices.
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
        // 4266675.00 / (4515 * 100) == 9.45
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
        // 09:30 through 10:33 — the 64 one-minute bars observed live at 10:33.
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

    /// Verbatim `hq.sinajs.cn` response for `sh600000`, live on 2026-10-08.
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

    /// Sina reports volume in **shares**; the rest of the app speaks 手, so the
    /// parser divides by 100. Getting this wrong would show 100x the volume.
    #[test]
    fn sina_converts_share_volume_to_hand() {
        let p = &sina::parse_quotes(SINA_QUOTE_LINE)[0];
        // 88,133,329 shares == 881,333.29 手
        assert!((p.volume - 881_333.29).abs() < 0.01, "got {}", p.volume);
    }

    /// Sina does not send change/percent, so they are derived from 昨收.
    #[test]
    fn sina_derives_change_and_percent() {
        let p = &sina::parse_quotes(SINA_QUOTE_LINE)[0];
        assert!((p.change - 0.22).abs() < 1e-9, "got {}", p.change);
        // 0.22 / 9.48 * 100
        assert!((p.change_pct - 2.3207).abs() < 0.001, "got {}", p.change_pct);
    }

    /// A suspended security reports zeros; showing it would read as -100%.
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
        // Recognised code but an empty payload (unknown symbol).
        assert!(sina::parse_quotes("var hq_str_sh999999=\"\";").is_empty());
        // Too few fields to be a quote.
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

    /// The regression that matters most for Sina: the endpoint returns the last
    /// `datalen` bars, which **span two trading days**. Without filtering, the
    /// chart would splice the previous session onto today's.
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
        // Two 10-08 bars plus the synthesized 09:30 open.
        assert_eq!(t.points.len(), 3, "previous day must be dropped: {:?}", t.points);
        assert!(t.points.iter().all(|p| p.time >= 930));
        assert!(t.points.iter().all(|p| p.price > 9.4), "9-30 prices leaked in");
    }

    /// Sina's volume/amount are per minute; `TrendPoint` is defined as
    /// cumulative, so they must be accumulated.
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
        // 均价 = 38300 / (40 * 100)
        assert!((p2.avg_price - 9.575).abs() < 1e-9, "got {}", p2.avg_price);
    }

    /// Sina omits the 09:30 opening print; the first bar's `open` is the day's
    /// open, so a 09:30 point is prepended to match Tencent and the usual chart.
    #[test]
    fn sina_trend_prepends_the_0930_open() {
        let json = format!("[{}]", sina_bar("2026-10-08 09:31:00", "9.45", "9.47", "1000", "9470"));

        let t = sina::parse_trend("sh600000", json.as_bytes()).unwrap();
        assert_eq!(t.points.len(), 2);
        let open = &t.points[0];
        assert_eq!(open.time, 930);
        assert_eq!(open.price, 9.45, "09:30 should carry the day's opening price");
        // No volume has traded at the open print, so 均价 falls back to price
        // rather than becoming NaN.
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
        // Needs enough bars to cover a 241-point session plus the prior day.
        assert!(url.contains("datalen=300"), "url was {url}");
    }

    // --------------------------------------------------------- shared

    /// Guards the GB18030 requirement. Decoding these bytes as UTF-8 must NOT
    /// yield 浦发银行 — if it ever does, the fixture stopped testing anything.
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

    /// Both providers must produce the same `TrendPoint` semantics, since the
    /// frontend chart cannot tell them apart.
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
        assert_eq!(bars[0].volume, 25017.0); // 2501700 shares / 100 = 25017 手
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
}

/// End-to-end checks against the live endpoints. Network-dependent, so they are
/// `#[ignore]`d by default — run explicitly with:
///
/// ```text
/// cargo test -- --ignored --nocapture
/// ```
///
/// The unit tests above only prove the *parsers* handle captured payloads.
/// Nothing else verifies that `Fetcher` can reach the hosts from this machine,
/// which is exactly what `.no_proxy()` is there to guarantee.
#[cfg(test)]
mod live_tests {
    use super::*;

    fn fetcher() -> Fetcher {
        Fetcher::new().expect("client should build")
    }

    /// Real Chinese names prove the GB18030 decode worked: a UTF-8 misread
    /// yields replacement characters instead.
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
            // Derived consistently for both providers.
            assert!(
                q.change_pct.abs() < 25.0,
                "{source:?} {} absurd changePct {}",
                q.code,
                q.change_pct
            );
        }
        println!(
            "{source:?} quotes: {:?}",
            quotes.iter().map(|q| (&q.code, &q.name, q.price, q.change_pct)).collect::<Vec<_>>()
        );
    }

    async fn check_trend(source: DataSource) {
        // Sina's series carries no previous close, so pass one in.
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

        let first = &t.points[0];
        let last = t.points.last().unwrap();
        println!(
            "{source:?} trend {} {}: {} pts, {}..{}, first {} @{} (均价 {:.2}), last {} @{} (均价 {:.2})",
            t.code, t.date, t.points.len(), first.time, last.time,
            first.price, first.time, first.avg_price, last.price, last.time, last.avg_price
        );
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

    /// Both providers must agree closely on the same security, which is the
    /// real test that the two parsers mean the same thing.
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
        println!("tencent {tp} vs sina {sp} ({:.3}% apart)", diff * 100.0);
    }

    /// An unknown code must fail softly — the poller relies on this to keep
    /// serving the rest of the watchlist.
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
