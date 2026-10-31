//! IPC command handlers organized by functional domain.

pub mod ai_decision;
pub mod config;
pub mod dragon_tiger;
pub mod log;
pub mod portfolio;
pub mod quote;
pub mod updater;
pub mod watchlist;
pub mod window;

pub use ai_decision::*;
pub use config::*;
pub use dragon_tiger::*;
pub use log::*;
pub use portfolio::*;
pub use quote::*;
pub use updater::*;
pub use watchlist::*;
pub use window::*;
