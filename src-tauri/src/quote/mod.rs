//! Quote fetching from Tencent, Sina, and Yahoo Finance.

pub mod types;
pub mod tencent;
pub mod sina;
pub mod indicators;
pub mod yahoo;
pub mod fetcher;
pub mod global;
pub mod multi_trend;
pub mod ths;
pub mod trend_guard;

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
#[allow(unused_imports)]
pub use multi_trend::*;
#[allow(unused_imports)]
pub use ths::*;
#[allow(unused_imports)]
pub use trend_guard::*;

#[cfg(test)]
mod tests;

#[cfg(test)]
#[path = "live_tests.rs"]
mod live_tests;
