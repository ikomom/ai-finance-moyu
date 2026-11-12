//! Data types for historical intraday trend archiving.

use std::collections::BTreeMap;
use serde::{Deserialize, Serialize};

use crate::quote::types::{DayTrend, TrendPoint};
use crate::quote::tencent::parse_trend_point;

pub const ARCHIVE_SCHEMA_VERSION: u32 = 1;

/// A single day's compact intraday minute trend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredDayTrend {
    pub pre_close: f64,
    pub complete: bool,
    pub point_count: usize,
    pub rows: Vec<String>,
}

/// A whole year's archive of daily intraday trends for a single security.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YearArchive {
    pub schema_version: u32,
    pub code: String,
    pub year: i32,
    pub updated_at: String,
    pub days: BTreeMap<String, StoredDayTrend>,
}

impl YearArchive {
    pub fn new(code: String, year: i32) -> Self {
        Self {
            schema_version: ARCHIVE_SCHEMA_VERSION,
            code,
            year,
            updated_at: chrono::Local::now().to_rfc3339(),
            days: BTreeMap::new(),
        }
    }
}

pub fn point_to_row(p: &TrendPoint) -> String {
    format!("{:04} {:.2} {} {} {:.2}", p.time, p.price, p.cum_volume, p.cum_amount, p.avg_price)
}

pub fn day_trend_to_stored(day: &DayTrend) -> StoredDayTrend {
    let rows = day.points.iter().map(point_to_row).collect();
    let is_complete = day.points.len() >= 238; // Normal full session has 240/241 points
    StoredDayTrend {
        pre_close: day.pre_close,
        complete: is_complete,
        point_count: day.points.len(),
        rows,
    }
}

pub fn stored_to_day_trend(date: &str, stored: &StoredDayTrend) -> DayTrend {
    let mut points = Vec::with_capacity(stored.rows.len());
    for row in &stored.rows {
        if let Some(p) = parse_trend_point(row) {
            points.push(p);
        }
    }
    DayTrend {
        date: date.to_string(),
        pre_close: stored.pre_close,
        points,
    }
}
