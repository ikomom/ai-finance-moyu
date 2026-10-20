//! Edge-triggered threshold and anomaly detection.

pub mod types;
pub mod anomaly;
mod limit_board;
pub mod tracker;

#[allow(unused_imports)]
pub use types::*;
#[allow(unused_imports)]
pub use anomaly::*;
#[allow(unused_imports)]
pub use tracker::*;

#[cfg(test)]
mod tests;
