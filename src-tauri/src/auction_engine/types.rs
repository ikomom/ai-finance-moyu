//! Call-auction value types.
//!
//! Split from `mod.rs` to stay inside the 300-line budget (AGENTS.md §11).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UnmatchedSide {
    #[default]
    None,
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuctionTag {
    Normal,
    BullTrap,
    BearTrap,
    Snatching,
    Dumping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuctionPoint {
    /// 24h format HHMM or HHMMSS, e.g. 915, 91825, 145812.
    pub time: u32,
    /// Formatted time string e.g. "09:18:25", "14:58:12".
    #[serde(default)]
    pub raw_time: String,
    /// Auction match price.
    pub price: f64,
    /// Total volume (matched + unmatched) in 手.
    pub volume: f64,
    /// Matched volume in 手.
    #[serde(default)]
    pub matched_volume: f64,
    /// Unmatched residual order volume in 手.
    #[serde(default)]
    pub unmatched_volume: f64,
    /// Direction of unmatched order volume.
    #[serde(default)]
    pub unmatched_side: UnmatchedSide,
}

impl AuctionPoint {
    pub fn new(time: u32, price: f64, volume: f64) -> Self {
        Self {
            time,
            raw_time: String::new(),
            price,
            volume,
            matched_volume: volume,
            unmatched_volume: 0.0,
            unmatched_side: UnmatchedSide::None,
        }
    }

    pub fn with_unmatched(
        time: u32,
        price: f64,
        matched_volume: f64,
        unmatched_volume: f64,
        unmatched_side: UnmatchedSide,
    ) -> Self {
        Self {
            time,
            raw_time: String::new(),
            price,
            volume: matched_volume + unmatched_volume,
            matched_volume,
            unmatched_volume,
            unmatched_side,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuctionDiagnosis {
    pub tag: AuctionTag,
    pub label: String,
    pub detail: String,
    pub early_peak_pct: f64,
    pub locked_pct: f64,
    pub volume_drop_pct: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuctionData {
    pub code: String,
    pub date: String,
    pub points: Vec<AuctionPoint>,
    #[serde(default)]
    pub closing_points: Vec<AuctionPoint>,
    pub diagnosis: Option<AuctionDiagnosis>,
}
