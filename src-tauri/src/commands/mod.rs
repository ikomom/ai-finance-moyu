//! IPC command handlers organized by functional domain.

pub mod ai_decision;
pub mod config;
pub mod log;
pub mod portfolio;
pub mod quote;
pub mod updater;
pub mod window;

pub use ai_decision::*;
pub use config::*;
pub use log::*;
pub use portfolio::*;
pub use quote::*;
pub use updater::*;
pub use window::*;
