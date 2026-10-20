//! Window management subsystem: geometry, move/resize, edge-docking, visibility,
//! win32 styles, and hotkeys.

pub mod dock;
pub mod geometry;
pub mod hotkey;
pub mod move_resize;
pub mod platform_win32;
pub mod visibility;

pub use dock::*;
pub use geometry::*;
pub use hotkey::*;
pub use move_resize::*;
pub use platform_win32::*;
pub use visibility::*;
