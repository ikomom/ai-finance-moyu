//! Dragon & Tiger List (龙虎榜) and Community Sentiment module.

pub mod baseline;
pub mod client;
pub mod seat_client;
pub mod seat_radar;
pub mod trader_dict;
pub mod types;

#[cfg(test)]
mod tests;

pub use client::DragonTigerClient;
pub use seat_client::SeatClient;
pub use seat_radar::SeatRadarClient;
pub use types::*;

/// 将东财无前缀股票代码（如 600000, 000001, 920201, 830799）规范化为带市场前缀代码（sh/sz/bj）
pub(crate) fn canonical_stock_code(bare_code: &str) -> String {
    crate::market::normalize_code(bare_code).unwrap_or_else(|_| {
        if bare_code.starts_with('6') {
            format!("sh{bare_code}")
        } else if bare_code.starts_with('8') || bare_code.starts_with('4') || bare_code.starts_with('9') {
            format!("bj{bare_code}")
        } else {
            format!("sz{bare_code}")
        }
    })
}
