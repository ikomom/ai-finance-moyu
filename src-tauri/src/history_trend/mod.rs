//! Historical intraday trend storage and archival engine.

pub mod types;
pub mod store;
#[cfg(test)]
mod tests;

pub use store::{
    archive_days, clear_history, get_available_dates, get_day_trend, get_history_stats,
    history_trend_root, security_dir,
};
pub use types::{StoredDayTrend, YearArchive};
pub use crate::quote::types::DayTrend;
