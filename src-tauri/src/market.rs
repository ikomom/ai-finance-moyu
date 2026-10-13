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

/// Calculate the number of continuous trading minutes that have elapsed today (1.0 to 240.0).
pub fn elapsed_trading_minutes(now: NaiveDateTime) -> f64 {
    let t = now.time();
    let (h, m) = (t.hour(), t.minute());
    let current_mins = h * 60 + m;
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn dt(y: i32, mo: u32, d: u32, h: u32, mi: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, mo, d).unwrap().and_hms_opt(h, mi, 0).unwrap()
    }

    #[test]
    fn normalizes_bare_codes_by_leading_digits() {
        assert_eq!(normalize_code("600000").unwrap(), "sh600000");
        assert_eq!(normalize_code("688981").unwrap(), "sh688981");
        assert_eq!(normalize_code("000001").unwrap(), "sz000001");
        assert_eq!(normalize_code("300750").unwrap(), "sz300750");
        assert_eq!(normalize_code("399006").unwrap(), "sz399006");
        assert_eq!(normalize_code("830799").unwrap(), "bj830799");
    }

    #[test]
    fn keeps_existing_prefix_and_lowercases() {
        assert_eq!(normalize_code("sh600000").unwrap(), "sh600000");
        assert_eq!(normalize_code("SH600000").unwrap(), "sh600000");
        assert_eq!(normalize_code("  sz300750  ").unwrap(), "sz300750");
        assert_eq!(normalize_code("sh000001").unwrap(), "sh000001");
    }

    /// The whole reason `quote.rs` parses the variable name instead of the code
    /// field: these two are different securities that both report `000001`.
    #[test]
    fn sh_and_sz_same_digits_do_not_collide() {
        assert_ne!(normalize_code("sh000001").unwrap(), normalize_code("sz000001").unwrap());
    }

    #[test]
    fn rejects_garbage() {
        assert!(normalize_code("").is_err());
        assert!(normalize_code("60000").is_err());
        assert!(normalize_code("abcdef").is_err());
        assert!(normalize_code("sh60000").is_err());
        assert!(normalize_code("990000").is_err());
    }

    #[test]
    fn session_boundaries_weekday() {
        // 2026-10-08 is a Thursday.
        assert_eq!(session_at(dt(2026, 10, 8, 9, 0)), Session::PreOpen);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 15)), Session::CallAuctionCancelable);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 19)), Session::CallAuctionCancelable);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 20)), Session::CallAuctionLocked);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 24)), Session::CallAuctionLocked);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 25)), Session::PreTrade);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 29)), Session::PreTrade);
        assert_eq!(session_at(dt(2026, 10, 8, 9, 30)), Session::Morning);
        assert_eq!(session_at(dt(2026, 10, 8, 11, 30)), Session::Morning);
        assert_eq!(session_at(dt(2026, 10, 8, 11, 31)), Session::LunchBreak);
        assert_eq!(session_at(dt(2026, 10, 8, 12, 59)), Session::LunchBreak);
        assert_eq!(session_at(dt(2026, 10, 8, 13, 0)), Session::Afternoon);
        assert_eq!(session_at(dt(2026, 10, 8, 14, 56)), Session::Afternoon);
        assert_eq!(session_at(dt(2026, 10, 8, 14, 57)), Session::ClosingAuction);
        assert_eq!(session_at(dt(2026, 10, 8, 15, 0)), Session::ClosingAuction);
        assert_eq!(session_at(dt(2026, 10, 8, 15, 1)), Session::Closed);
        assert_eq!(session_at(dt(2026, 10, 8, 23, 59)), Session::Closed);
    }

    #[test]
    fn weekend_is_always_closed() {
        // 2026-10-10 is a Saturday, 2026-10-11 a Sunday.
        assert_eq!(session_at(dt(2026, 10, 10, 10, 0)), Session::Closed);
        assert_eq!(session_at(dt(2026, 10, 11, 14, 0)), Session::Closed);
    }

    #[test]
    fn is_live_matches_polling_windows() {
        assert!(Session::CallAuctionCancelable.is_live());
        assert!(Session::CallAuctionLocked.is_live());
        assert!(Session::Morning.is_live());
        assert!(Session::Afternoon.is_live());
        assert!(Session::ClosingAuction.is_live());
        assert!(!Session::PreOpen.is_live());
        assert!(!Session::PreTrade.is_live());
        assert!(!Session::LunchBreak.is_live());
        assert!(!Session::Closed.is_live());
    }
}
