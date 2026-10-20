//! Poll status bookkeeping and desktop notifications.
//!
//! Split from `poller.rs` to stay inside the 300-line budget (AGENTS.md §11).

use chrono::Local;
use tauri::{AppHandle, Manager};

use crate::market;
use crate::quote::Quote;
use crate::state::{AppState, PollStatus};

use super::AlertNotification;


pub(super) fn record_success(app: &AppHandle, quotes: &[Quote]) {
    let today = Local::now().format("%Y%m%d").to_string();
    let feed_date = quotes.iter().find_map(|q| {
        if q.date.is_empty() { None } else { Some(q.date.clone()) }
    });
    let trading_today = feed_date.as_deref() == Some(today.as_str());

    let state = app.state::<AppState>();
    let mut st = state.status.lock().unwrap_or_else(|e| e.into_inner());
    st.last_update = Some(Local::now().format("%H:%M:%S").to_string());
    st.error = None;
    st.trading_today = trading_today;
    st.session = format!("{:?}", market::session_at(Local::now().naive_local()));
    if feed_date.is_some() {
        st.feed_date = feed_date;
    }
}

pub(super) fn record_error(app: &AppHandle, message: &str) {
    let state = app.state::<AppState>();
    let mut st: std::sync::MutexGuard<'_, PollStatus> = state.status.lock().unwrap_or_else(|e| e.into_inner());
    st.error = Some(message.to_string());
    st.session = format!("{:?}", market::session_at(Local::now().naive_local()));
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
                    crate::navigate_to_stock_mini(&app_handle, &code);
                }
            });
        }
    });
}

