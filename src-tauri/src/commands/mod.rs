//! IPC command handlers organized by functional domain.

pub mod agent;
pub mod agent_config;
pub mod config;
pub mod log;
pub mod quote;
pub mod updater;
pub mod window;

pub use agent::*;
pub use agent_config::CLEAR_KEY_SENTINEL;
pub use config::*;
pub use log::*;
pub use quote::*;
pub use updater::*;
pub use window::*;

