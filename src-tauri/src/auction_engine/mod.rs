//! Morning call-auction (09:15–09:25) microstructure analysis.
//!
//! - [`types`]      value objects
//! - [`tracker`]    per-security accumulation
//! - [`heuristics`] the diagnosis rules

mod heuristics;
mod tracker;
mod types;

pub use heuristics::*;
pub use tracker::*;
pub use types::*;

#[cfg(test)]
mod tests;
