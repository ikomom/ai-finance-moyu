//! IPC command handlers organized by functional domain.

pub mod config;
pub mod log;
pub mod quote;
pub mod window;

pub use config::*;
pub use log::*;
pub use quote::*;
pub use window::*;
