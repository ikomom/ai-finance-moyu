//! Shared validation and staleness purging helpers for intraday `Trend` series.

use chrono::{NaiveDateTime, Timelike};

use super::types::Trend;

/// Returns true if an intraday trend claiming today's date already carries
/// timestamps significantly ahead of Beijing wall-clock time during trading hours.
///
/// Guards against upstream CDN shards (e.g. THS `today.js`) that roll the `date`
/// label to the new trading day before clearing the previous session's `data` array.
pub fn has_future_points_at(trend: &Trend, now: NaiveDateTime) -> bool {
    let session = crate::market::session_at(now);
    if matches!(session, crate::market::Session::Closed) {
        return false;
    }
    let today_str = now.format("%Y%m%d").to_string();
    if trend.date != today_str {
        return false;
    }
    let Some(max_hhmm) = trend.points.iter().map(|p| p.time).max() else {
        return false;
    };
    let now_min = (now.hour() * 60 + now.minute()) as i32;
    let last_min = ((max_hhmm / 100) * 60 + (max_hhmm % 100)) as i32;
    last_min > now_min + 10
}

/// Returns true when an index trend's `pre_close` diverges materially (>0.2%)
/// from the live index quote's `pre_close`, indicating cross-day stale data.
pub fn is_index_pre_close_mismatched(
    code: &str,
    trend_pre_close: f64,
    quote_pre_close: f64,
) -> bool {
    crate::market::is_index(code)
        && trend_pre_close > 0.0
        && quote_pre_close > 0.0
        && ((trend_pre_close - quote_pre_close).abs() / quote_pre_close) > 0.002
}

/// Clear `trend.points` in-place when cached or newly fetched intraday data is stale
/// relative to `quote_date`, `quote_pre_close`, or `now`.
///
/// Never clears the previous trading day's curve during `Session::PreOpen` (`00:00..09:14`)
/// before today's quotes start rolling over.
pub fn sanitize_trend_for_quote(
    trend: &mut Trend,
    quote_date: &str,
    quote_pre_close: f64,
    now: NaiveDateTime,
) -> bool {
    sanitize_trend_for_quote_with_market(trend, quote_date, quote_pre_close, false, now)
}

/// Variant of [`sanitize_trend_for_quote`] aware of whether the broader exchange feed has
/// already opened today (`market_trading_today`), allowing quiet/index symbols to clear
/// stale previous-day data as soon as morning call auction starts at `09:15`.
pub fn sanitize_trend_for_quote_with_market(
    trend: &mut Trend,
    quote_date: &str,
    quote_pre_close: f64,
    market_trading_today: bool,
    now: NaiveDateTime,
) -> bool {
    let today_str = now.format("%Y%m%d").to_string();
    let session = crate::market::session_at(now);
    let is_active_today = !matches!(session, crate::market::Session::PreOpen | crate::market::Session::Closed)
        && market_trading_today;

    let date_stale = (!quote_date.is_empty() && !trend.date.is_empty() && trend.date.as_str() < quote_date)
        || (is_active_today && !trend.date.is_empty() && trend.date < today_str);

    // Only compare pre_close against the quote when the quote is at least as fresh as the trend.
    let can_check_pre =
        quote_date.is_empty() || trend.date.is_empty() || quote_date >= trend.date.as_str();
    let pre_mismatch =
        can_check_pre && is_index_pre_close_mismatched(&trend.code, trend.pre_close, quote_pre_close);
    let future_stale = has_future_points_at(trend, now);

    if !(date_stale || pre_mismatch || future_stale) {
        return false;
    }

    let cleared_points = !trend.points.is_empty();
    trend.points.clear();
    if is_active_today || future_stale {
        trend.date = if !quote_date.is_empty() && quote_date >= today_str.as_str() {
            quote_date.to_string()
        } else {
            today_str
        };
    } else if !quote_date.is_empty() && quote_date >= trend.date.as_str() {
        trend.date = quote_date.to_string();
    }
    if quote_pre_close > 0.0 {
        trend.pre_close = quote_pre_close;
    }
    cleared_points
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::*;
    use crate::quote::TrendPoint;

    fn sample_trend(code: &str, date: &str, pre_close: f64, times: &[u32]) -> Trend {
        Trend {
            code: code.to_string(),
            date: date.to_string(),
            pre_close,
            points: times
                .iter()
                .map(|&time| TrendPoint {
                    time,
                    price: pre_close,
                    cum_volume: 100.0,
                    cum_amount: 1000.0,
                    avg_price: pre_close,
                })
                .collect(),
        }
    }

    #[test]
    fn detects_future_timestamps_on_trading_morning() {
        let now = NaiveDate::from_ymd_opt(2026, 11, 26)
            .unwrap()
            .and_hms_opt(9, 41, 0)
            .unwrap();
        let poisoned = sample_trend("sh000001", "20261126", 3548.37, &[930, 1130, 1500]);
        assert!(has_future_points_at(&poisoned, now));

        let live = sample_trend("sh000001", "20261126", 3476.47, &[930, 940, 941]);
        assert!(!has_future_points_at(&live, now));
    }

    #[test]
    fn ignores_after_hours_and_previous_day_after_close() {
        let evening = NaiveDate::from_ymd_opt(2026, 11, 26)
            .unwrap()
            .and_hms_opt(15, 5, 0)
            .unwrap();
        let full_day = sample_trend("sh000001", "20261126", 3476.47, &[930, 1500]);
        assert!(!has_future_points_at(&full_day, evening));

        // Weekday holiday: quote and trend remain on previous trading day
        let holiday_morning = NaiveDate::from_ymd_opt(2026, 10, 1)
            .unwrap()
            .and_hms_opt(10, 0, 0)
            .unwrap();
        let mut prev_day = sample_trend("sh000001", "20260930", 3400.0, &[930, 1500]);
        assert!(!sanitize_trend_for_quote(
            &mut prev_day,
            "20260930",
            3400.0,
            holiday_morning
        ));
        assert_eq!(prev_day.points.len(), 2);
    }

    #[test]
    fn clears_stale_date_and_poisoned_index_pre_close() {
        let now = NaiveDate::from_ymd_opt(2026, 11, 26)
            .unwrap()
            .and_hms_opt(9, 41, 0)
            .unwrap();

        // Yesterday trend during active trading should clear when today's quote has arrived
        let mut old_day = sample_trend("sz399006", "20261125", 2200.0, &[930, 1500]);
        assert!(sanitize_trend_for_quote(&mut old_day, "20261126", 2183.58, now));
        assert!(old_day.points.is_empty());
        assert_eq!(old_day.date, "20261126");
        assert_eq!(old_day.pre_close, 2183.58);

        // Poisoned THS payload stamped with today's date and yesterday's pre_close + 15:00 points
        let mut poisoned = sample_trend("sh000001", "20261126", 3548.37, &[930, 1500]);
        assert!(sanitize_trend_for_quote(&mut poisoned, "20261126", 3476.47, now));
        assert!(poisoned.points.is_empty());
        assert_eq!(poisoned.pre_close, 3476.47);
    }

    #[test]
    fn preserves_previous_day_trend_before_0915_and_clears_when_call_auction_is_live() {
        let preopen_now = NaiveDate::from_ymd_opt(2026, 11, 27)
            .unwrap()
            .and_hms_opt(8, 55, 35)
            .unwrap();
        let mut prev_stock = sample_trend("sz000592", "20261126", 5.68, &[930, 1130, 1500]);
        assert!(!sanitize_trend_for_quote_with_market(
            &mut prev_stock,
            "20261126",
            5.68,
            false,
            preopen_now
        ));
        assert_eq!(prev_stock.points.len(), 3);

        let call_auction_now = NaiveDate::from_ymd_opt(2026, 11, 27)
            .unwrap()
            .and_hms_opt(9, 18, 0)
            .unwrap();
        let mut quiet_index = sample_trend("sh000001", "20261126", 3476.47, &[930, 1500]);
        assert!(sanitize_trend_for_quote_with_market(
            &mut quiet_index,
            "20261126",
            3476.47,
            true,
            call_auction_now
        ));
        assert!(quiet_index.points.is_empty());
        assert_eq!(quiet_index.date, "20261127");
    }
}
