//! Window management subsystem: geometry, edge-docking, visibility, win32 styles, and hotkeys.

pub mod dock;
pub mod geometry;
pub mod hotkey;
pub mod platform_win32;
pub mod visibility;

pub use dock::*;
pub use geometry::*;
pub use hotkey::*;
pub use platform_win32::*;
pub use visibility::*;
