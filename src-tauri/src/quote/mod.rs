//! Quote fetching from Tencent, Sina, and Yahoo Finance.

pub mod types;
pub mod tencent;
pub mod sina;
pub mod indicators;
pub mod yahoo;
pub mod fetcher;
pub mod global;

#[allow(unused_imports)]
pub use types::*;
#[allow(unused_imports)]
pub use indicators::*;
#[allow(unused_imports)]
pub use yahoo::*;
#[allow(unused_imports)]
pub use fetcher::*;
#[allow(unused_imports)]
pub use global::*;

#[cfg(test)]
mod tests;

#[cfg(test)]
#[path = "live_tests.rs"]
mod live_tests;
