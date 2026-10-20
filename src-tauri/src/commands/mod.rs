//! IPC command handlers organized by functional domain.

pub mod config;
pub mod log;
pub mod quote;
pub mod updater;
pub mod window;

pub use config::*;
pub use log::*;
pub use quote::*;
pub use updater::*;
pub use window::*;

