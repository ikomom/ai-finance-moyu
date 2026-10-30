//! Persistent settings, stored as JSON under the app config dir
//! (`%APPDATA%\ai-finance-moyu\config.json`).
//!
//! - [`layout`] holds the layout / visibility enums and per-layout sizes
//! - [`types`] holds the rest of the schema
//! - [`store`] holds load/save plus the offline quote cache

mod ai;
mod groups;
mod layout;
pub mod migrate;
mod prefs;
mod store;
mod types;

pub use store::*;
pub use types::*;

#[cfg(test)]
mod tests;
