use encoding_rs::GB18030;
use serde::{Deserialize, Serialize};

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

pub fn net_err(e: impl std::fmt::Display) -> FetchError {
    FetchError { kind: FetchErrorKind::Network, message: e.to_string() }
}

pub fn parse_err(e: impl std::fmt::Display) -> FetchError {
    FetchError { kind: FetchErrorKind::Parse, message: e.to_string() }
}

/// Decode a provider response body. Both are GB18030; treating them as UTF-8
/// mangles every Chinese security name.
pub fn decode_gb18030(bytes: &[u8]) -> String {
    let (cow, _, _) = GB18030.decode(bytes);
    cow.into_owned()
}

/// Lenient float parse — feeds occasionally emit `-` or blank for a field.
pub fn num(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

/// Build a point, deriving 均价 from the cumulative totals.
pub fn make_point(time: u32, price: f64, cum_volume: f64, cum_amount: f64) -> TrendPoint {
    let avg_price = if cum_volume > 0.0 && cum_amount > 0.0 {
        let calc = cum_amount / (cum_volume * 100.0);
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

pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                              (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
