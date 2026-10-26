//! Trend Engine: Local intraday volume-price and VWAP structure analysis.
//!
//! Evaluates:
//! - Real-time VWAP and index dynamic moving averages (MA20)
//! - VWAP slope / angle of ascent/descent
//! - Time-adaptive volume ratio (local minute volume vs moving average)
//! - Multi-peak and multi-trough volume-price divergence (顶背离 / 底背离)
//! - VWAP support pullbacks and resistance touches
//! - Context-aware overbought / oversold guards (avoids flagging down stocks as overbought)
//! - Composite score (-100 to +100) and human-readable diagnosis

mod analyze;
mod limit_board;
mod patterns;
pub mod sector_style;
mod types;

pub use analyze::*;
pub use sector_style::*;
pub use types::*;

#[cfg(test)]
mod tests;
