//! Poll status bookkeeping and desktop notifications.
//!
//! Split from `poller.rs` to stay inside the 300-line budget (AGENTS.md §11).

use chrono::NaiveDateTime;
use tauri::{AppHandle, Manager};

use crate::market;
use crate::quote::Quote;
use crate::state::{AppState, PollStatus};

use super::AlertNotification;

/// Update `PollStatus` fields when transitioning between market sessions.
pub(super) fn apply_session_sync(
    st: &mut PollStatus,
    now: NaiveDateTime,
    session: market::Session,
) {
    let today = now.format("%Y%m%d").to_string();
    st.session = format!("{session:?}");
    if let Some(feed_date) = st.feed_date.as_deref() {
        st.trading_today = feed_date == today.as_str();
    }
}

/// Keep `status.session` and `status.trading_today` accurate when crossing session
/// boundaries (e.g. `ClosingAuction -> Closed` or `Morning -> LunchBreak`) even
/// after live quote polling stops.
pub(super) fn sync_session(app: &AppHandle, now: NaiveDateTime, session: market::Session) {
    let state = app.state::<AppState>();
    let mut st = state.status.lock().unwrap_or_else(|e| e.into_inner());
    apply_session_sync(&mut st, now, session);
}

pub(super) fn record_success(app: &AppHandle, quotes: &[Quote]) {
    let now = market::beijing_now();
    let today = now.format("%Y%m%d").to_string();
    let feed_date = quotes.iter().find_map(|q| {
        if q.date.is_empty() { None } else { Some(q.date.clone()) }
    });
    let trading_today = feed_date.as_deref() == Some(today.as_str());

    let state = app.state::<AppState>();
    let mut st = state.status.lock().unwrap_or_else(|e| e.into_inner());
    st.last_update = Some(now.format("%H:%M:%S").to_string());
    st.error = None;
    st.trading_today = trading_today;
    st.session = format!("{:?}", market::session_at(now));
    if feed_date.is_some() {
        st.feed_date = feed_date;
    }
}

pub(super) fn record_error(app: &AppHandle, message: &str) {
    let now = market::beijing_now();
    let state = app.state::<AppState>();
    let mut st: std::sync::MutexGuard<'_, PollStatus> = state.status.lock().unwrap_or_else(|e| e.into_inner());
    st.error = Some(message.to_string());
    st.session = format!("{:?}", market::session_at(now));
}

/// Fire a desktop notification for a crossing event.
///
/// Suppressed during the call auction and pre-trade silence by the caller.
pub(super) fn spawn_system_notification(app: &AppHandle, notif: &AlertNotification) {
    let mut n = notify_rust::Notification::new();
    n.summary("股市异动");
    n.body(&notif.message);
    n.auto_icon();

    #[cfg(windows)]
    {
        if let Ok(exe) = tauri::utils::platform::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let curr_dir = exe_dir.display().to_string();
                let sep = std::path::MAIN_SEPARATOR;
                if !(curr_dir.ends_with(&format!("{sep}target{sep}debug"))
                    || curr_dir.ends_with(&format!("{sep}target{sep}release")))
                {
                    n.app_id("com.moyu.finance");
                }
            }
        }
    }

    let code = notif.code.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(handle) = n.show() {
            let _ = handle.wait_for_response(move |resp: &notify_rust::NotificationResponse| {
                if resp.is_default_action() || matches!(resp, notify_rust::NotificationResponse::Action(_)) {
                    let code = code.clone();
                    let handle = app_handle.clone();
                    let _ = app_handle.run_on_main_thread(move || {
                        crate::navigate_to_stock_mini(&handle, &code);
                    });
                }
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use super::*;

    #[test]
    fn apply_session_sync_updates_closed_and_rolls_midnight_trading_today() {
        let mut st = PollStatus {
            feed_date: Some("20261126".to_string()),
            trading_today: true,
            session: "ClosingAuction".to_string(),
            ..Default::default()
        };
        let after_close = NaiveDate::from_ymd_opt(2026, 11, 26)
            .unwrap()
            .and_hms_opt(15, 1, 5)
            .unwrap();
        apply_session_sync(&mut st, after_close, market::Session::Closed);
        assert_eq!(st.session, "Closed");
        assert!(st.trading_today);

        let next_preopen = NaiveDate::from_ymd_opt(2026, 11, 27)
            .unwrap()
            .and_hms_opt(0, 1, 0)
            .unwrap();
        apply_session_sync(&mut st, next_preopen, market::Session::PreOpen);
        assert_eq!(st.session, "PreOpen");
        assert!(!st.trading_today);
    }
}

