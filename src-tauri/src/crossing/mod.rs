//! Edge-triggered threshold and anomaly detection.

pub mod types;
pub mod anomaly;
pub mod tiers;
pub mod milestone;
mod format;
mod limit_board;
pub mod tracker;

#[allow(unused_imports)]
pub use types::*;
#[allow(unused_imports)]
pub use anomaly::*;
#[allow(unused_imports)]
pub use tracker::*;
#[allow(unused_imports)]
pub use tiers::*;
#[allow(unused_imports)]
pub use milestone::*;

#[cfg(test)]
mod tests;
