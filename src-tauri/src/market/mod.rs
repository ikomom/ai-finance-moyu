//! A股 code normalization and trading-session logic.

use chrono::{Datelike, NaiveDateTime, Timelike, Weekday};

/// Where we are in the A-share trading day.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Session {
    /// Before 09:15 — nothing happening yet.
    PreOpen,
    /// 09:15–09:19 开盘集合竞价（可报单、可撤单）.
    CallAuctionCancelable,
    /// 09:20–09:24 开盘集合竞价（可报单、不可撤单）.
    CallAuctionLocked,
    /// 09:25–09:29 静默期, between the auction and continuous trading.
    PreTrade,
    /// 09:30–11:30 morning continuous trading.
    Morning,
    /// 11:30–13:00 lunch break.
    LunchBreak,
    /// 13:00–14:56 afternoon continuous trading.
    Afternoon,
    /// 14:57–15:00 尾盘集合竞价（不可撤单）.
    ClosingAuction,
    /// After 15:00, or any time on a weekend.
    Closed,
}

impl Session {
    /// Whether quotes are worth polling in this session.
    pub fn is_live(self) -> bool {
        matches!(
            self,
            Session::CallAuctionCancelable
                | Session::CallAuctionLocked
                | Session::Morning
                | Session::Afternoon
                | Session::ClosingAuction
        )
    }

    /// Whether this session is within morning call auction (09:15–09:24).
    pub fn is_morning_auction(self) -> bool {
        matches!(
            self,
            Session::CallAuctionCancelable | Session::CallAuctionLocked
        )
    }

    /// Whether this session is within any call auction (morning or closing: 09:15–09:24, 14:57–15:00).
    pub fn is_call_auction(self) -> bool {
        matches!(
            self,
            Session::CallAuctionCancelable
                | Session::CallAuctionLocked
                | Session::ClosingAuction
        )
    }

    /// Whether error-recovery polling is allowed to hit the network.
    ///
    /// The poller retries fast while a feed is broken, but a retry loop running
    /// at 03:00 would hammer the endpoints all night for data that cannot
    /// exist. Recovery therefore only runs in sessions that can produce a new
    /// quote, plus the pre-open window so a machine that woke up early is ready
    /// by the time the auction starts.
    pub fn allows_retry(self) -> bool {
        self.is_live() || matches!(self, Session::PreOpen | Session::PreTrade)
    }
}

/// Which A-share market a code belongs to. Determines the URL prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Exchange {
    Shanghai,
    Shenzhen,
    Beijing,
}

impl Exchange {
    pub fn prefix(self) -> &'static str {
        match self {
            Exchange::Shanghai => "sh",
            Exchange::Shenzhen => "sz",
            Exchange::Beijing => "bj",
        }
    }
}

/// Normalize a user-supplied code into the canonical prefixed form used
/// everywhere internally (`sh600000`, `sz300750`, `bj830799`).
///
/// Accepts an already-prefixed code in any case (`SH600000`, `sh600000`) or a
/// bare 6-digit code. Bare codes are resolved by their leading digits.
///
/// Note the deliberate asymmetry: a bare `000001` resolves to *平安银行*
/// (`sz000001`), not *上证指数* (`sh000001`). Both exist and return the same
/// bare `000001` in their quote payloads, so indices must be written with an
/// explicit `sh` prefix. This is why [`crate::quote`] parses the variable name
/// out of the response line rather than trusting the code field.
pub fn normalize_code(input: &str) -> Result<String, String> {
    let s = input.trim().to_ascii_lowercase();
    if s.is_empty() {
        return Err("代码为空".into());
    }

    // Already prefixed — validate the digits and keep it as-is.
    if let Some(rest) = s.strip_prefix("sh").or_else(|| s.strip_prefix("sz")) {
        if is_six_digits(rest) {
            return Ok(s);
        }
        return Err(format!("非法代码: {input}"));
    }
    if let Some(rest) = s.strip_prefix("bj") {
        if is_six_digits(rest) {
            return Ok(s);
        }
        return Err(format!("非法代码: {input}"));
    }

    if !is_six_digits(&s) {
        return Err(format!("非法代码: {input}（应为 6 位数字，或带 sh/sz/bj 前缀）"));
    }

    let ex = exchange_of(&s).ok_or_else(|| format!("无法识别的代码: {input}"))?;
    Ok(format!("{}{}", ex.prefix(), s))
}

fn is_six_digits(s: &str) -> bool {
    s.len() == 6 && s.bytes().all(|b| b.is_ascii_digit())
}

/// Map a bare 6-digit code to its exchange by leading digits.
fn exchange_of(code: &str) -> Option<Exchange> {
    let two = &code[..2];
    match two {
        // 沪市: 60 主板, 68 科创板, 90 B股, 50/51/56/58 基金
        "60" | "68" | "90" | "50" | "51" | "56" | "58" => Some(Exchange::Shanghai),
        // 深市: 00 主板, 30 创业板, 20 B股, 15/16/18 基金, 39 指数
        "00" | "30" | "20" | "15" | "16" | "18" | "39" => Some(Exchange::Shenzhen),
        // 北交所: 83/87/88 以及 43 开头（新三板转板）
        "83" | "87" | "88" | "43" | "92" => Some(Exchange::Beijing),
        _ => None,
    }
}

/// Current session at a given local datetime.
pub fn session_at(dt: NaiveDateTime) -> Session {
    if matches!(dt.weekday(), Weekday::Sat | Weekday::Sun) {
        return Session::Closed;
    }
    let m = dt.hour() * 60 + dt.minute();
    match m {
        0..=554 => Session::PreOpen,                // ..09:14
        555..=559 => Session::CallAuctionCancelable,// 09:15–09:19 (可撤单)
        560..=564 => Session::CallAuctionLocked,    // 09:20–09:24 (不可撤单)
        565..=569 => Session::PreTrade,             // 09:25–09:29
        570..=690 => Session::Morning,              // 09:30–11:30 inclusive
        691..=779 => Session::LunchBreak,           // 11:31–12:59
        780..=896 => Session::Afternoon,            // 13:00–14:56 inclusive
        897..=900 => Session::ClosingAuction,       // 14:57–15:00 尾盘竞价
        _ => Session::Closed,                       // 15:01..
    }
}

/// Check whether a normalized security code represents a macro market index
/// (e.g. sh000001 上证指数, sz399001 深证成指, sz399006 创业板指, bj899050 北证50).
pub fn is_index(code: &str) -> bool {
    let s = code.trim().to_ascii_lowercase();
    s.starts_with("sh000") || s.starts_with("sz399") || s.starts_with("bj899")
}

/// Calculate A-share daily upper and lower price limits (涨停价, 跌停价) based on pre_close.
/// Rules:
/// - ChiNext (sz30*) & STAR Market (sh68*): ±20%
/// - Beijing Stock Exchange (bj8*, bj43*, bj92*): ±30%
/// - ST securities (name contains "ST"): ±5%
/// - Main Board (sh60*, sz00*): ±10%
///
/// Prices are rounded to 2 decimal places according to exchange rules.
pub fn calculate_limit_prices(code: &str, name: &str, pre_close: f64) -> Option<(f64, f64)> {
    if pre_close <= 0.0 {
        return None;
    }
    let is_gem_or_star = code.starts_with("sz30") || code.starts_with("sh68");
    let is_bse = code.starts_with("bj8") || code.starts_with("bj43") || code.starts_with("bj92");
    let is_st = name.contains("ST");
    let ratio = if is_bse {
        0.30
    } else if is_gem_or_star {
        0.20
    } else if is_st {
        0.05
    } else {
        0.10
    };
    let up_price = ((pre_close * (1.0 + ratio) * 100.0).round()) / 100.0;
    let down_price = ((pre_close * (1.0 - ratio) * 100.0).round()) / 100.0;
    Some((up_price, down_price))
}

/// Current Beijing time (UTC+8). A-share markets strictly operate under China Standard Time.
pub fn beijing_now() -> NaiveDateTime {
    let beijing = chrono::FixedOffset::east_opt(8 * 3600).unwrap();
    chrono::Utc::now().with_timezone(&beijing).naive_local()
}

/// Calculate elapsed continuous trading minutes at a given minute of the day (0..1440).
pub fn elapsed_trading_minutes_at_minute(current_mins: u32) -> f64 {
    let m_open = 9 * 60 + 30; // 570 (09:30)
    let m_noon = 11 * 60 + 30; // 690 (11:30)
    let a_open = 13 * 60; // 780 (13:00)
    let a_close = 15 * 60; // 900 (15:00)

    if current_mins <= m_open {
        1.0
    } else if current_mins <= m_noon {
        ((current_mins - m_open) as f64).max(1.0)
    } else if current_mins <= a_open {
        120.0
    } else if current_mins <= a_close {
        120.0 + ((current_mins - a_open) as f64).max(0.0)
    } else {
        240.0
    }
}

/// Parse time string into minute-of-day (0..1440).
/// Supports "HH:MM:SS", "HH:MM", "YYYYMMDDHHMMSS", and "HHMMSS".
pub fn parse_time_to_minutes(time_str: &str) -> Option<u32> {
    let s = time_str.trim();
    if s.contains(':') {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() >= 2 {
            let h = parts[0].parse::<u32>().ok()?;
            let m = parts[1].parse::<u32>().ok()?;
            if h < 24 && m < 60 {
                return Some(h * 60 + m);
            }
        }
    } else if s.len() == 14 && s.chars().all(|c| c.is_ascii_digit()) {
        let h = s[8..10].parse::<u32>().ok()?;
        let m = s[10..12].parse::<u32>().ok()?;
        if h < 24 && m < 60 {
            return Some(h * 60 + m);
        }
    } else if s.len() == 6 && s.chars().all(|c| c.is_ascii_digit()) {
        let h = s[0..2].parse::<u32>().ok()?;
        let m = s[2..4].parse::<u32>().ok()?;
        if h < 24 && m < 60 {
            return Some(h * 60 + m);
        }
    }
    None
}

/// Calculate elapsed trading minutes directly from a quote's timestamp, if available.
pub fn elapsed_trading_minutes_from_quote(quote: &crate::quote::Quote) -> Option<f64> {
    parse_time_to_minutes(&quote.time).map(elapsed_trading_minutes_at_minute)
}

/// Calculate the number of continuous trading minutes that have elapsed today (1.0 to 240.0).
pub fn elapsed_trading_minutes(now: NaiveDateTime) -> f64 {
    let t = now.time();
    let current_mins = t.hour() * 60 + t.minute();
    elapsed_trading_minutes_at_minute(current_mins)
}

#[cfg(test)]
mod tests;
