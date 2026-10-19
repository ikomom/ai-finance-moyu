//! Window geometry, sizing, clamping to screen boundaries, and move/resize debounce.

use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::config::{Layout, LayoutSizes};
use crate::state::{AppState, DockEdge};
pub use super::move_resize::{suppress_move, suppress_resize};
use super::platform_win32::disable_maximize;

/// Label of the floating display window, and of the settings window.
pub const DISPLAY: &str = "main";
pub const SETTINGS: &str = "settings";
pub const COPILOT: &str = "copilot";

/// Distance from screen edge to snap and enable dock collapse (in logical px).
pub const DOCK_SNAP_THRESHOLD: f64 = 15.0;
/// Visible sliver width/thickness when collapsed (in logical px).
pub const DOCK_HANDLE_THICKNESS: f64 = 10.0;

/// Natural size for a layout, used until the user resizes that layout.
///
/// The bar layout is a horizontal pill, mini is a card chart, list is a compact table, market is a panorama card.
pub fn natural_size(layout: Layout, rows: usize) -> (f64, f64) {
    match layout {
        Layout::Bar => {
            let w = ((rows.max(1) as f64) * 125.0 + 30.0).clamp(240.0, 560.0);
            (w, 32.0)
        }
        Layout::Mini => (320.0, 180.0),
        Layout::List => {
            let h = ((rows.max(1) as f64) * 30.0 + 72.0).clamp(140.0, 260.0);
            (360.0, h)
        }
        Layout::Market => (345.0, 275.0),
        Layout::Global => (350.0, 280.0),
    }
}

/// The size to apply: whatever the user set for this layout, else the natural size.
pub fn size_for(layout: Layout, rows: usize, sizes: &LayoutSizes) -> (f64, f64) {
    match layout {
        Layout::Bar => {
            let w = sizes
                .get(Layout::Bar)
                .map(|(w, _)| w)
                .unwrap_or_else(|| natural_size(Layout::Bar, rows).0);
            (w.clamp(180.0, 1400.0), 32.0)
        }
        Layout::Mini => sizes.get(Layout::Mini).unwrap_or_else(|| natural_size(Layout::Mini, rows)),
        Layout::List => sizes.get(Layout::List).unwrap_or_else(|| natural_size(Layout::List, rows)),
        Layout::Market => sizes.get(Layout::Market).unwrap_or_else(|| natural_size(Layout::Market, rows)),
        Layout::Global => sizes.get(Layout::Global).unwrap_or_else(|| natural_size(Layout::Global, rows)),
    }
}

/// Size and position the display window, keeping it inside the monitor's usable area.
///
/// The saved position is a *hint*, not a command. On a display narrower than the
/// hint assumes, an unclamped window lands partly or wholly off-screen.
pub fn place_window(app: &AppHandle, layout: Layout, rows: usize) {
    let Some(win) = app.get_webview_window(DISPLAY) else {
        return;
    };

    let (w, h, mut x, mut y, edge, collapsed) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        let dock = *state.dock_state.lock().unwrap_or_else(|e| e.into_inner());
        let (w, h) = size_for(layout, rows, &cfg.layout_sizes);
        (w, h, cfg.window.x as f64, cfg.window.y as f64, dock.edge, dock.collapsed)
    };

    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten());
    if let Some(mon) = monitor {
        let scale = mon.scale_factor();
        let mpos = mon.position().to_logical::<f64>(scale);
        let msize = mon.size().to_logical::<f64>(scale);
        match edge {
            DockEdge::Right => {
                x = mpos.x + msize.width - w;
                y = y.clamp(mpos.y, (mpos.y + msize.height - h).max(mpos.y));
            }
            DockEdge::Left => {
                x = mpos.x;
                y = y.clamp(mpos.y, (mpos.y + msize.height - h).max(mpos.y));
            }
            DockEdge::Top => {
                x = x.clamp(mpos.x, (mpos.x + msize.width - w).max(mpos.x));
                y = mpos.y;
            }
            DockEdge::None => {
                let max_x = (mpos.x + msize.width - w).max(mpos.x);
                let max_y = (mpos.y + msize.height - h).max(mpos.y);
                x = x.clamp(mpos.x, max_x);
                y = y.clamp(mpos.y, max_y);
            }
        }

        if collapsed && edge != DockEdge::None {
            let (cw, ch, cx, cy) = match edge {
                DockEdge::Right => (
                    DOCK_HANDLE_THICKNESS,
                    h,
                    mpos.x + msize.width - DOCK_HANDLE_THICKNESS,
                    y,
                ),
                DockEdge::Left => (DOCK_HANDLE_THICKNESS, h, mpos.x, y),
                DockEdge::Top => (w, DOCK_HANDLE_THICKNESS, x, mpos.y),
                DockEdge::None => (w, h, x, y),
            };
            let _ = win.set_resizable(false);
            let _ = win.set_size(tauri::LogicalSize::new(cw, ch));
            let _ = win.set_position(tauri::LogicalPosition::new(cx, cy));
            return;
        }
    }

    // Size first, then position: the clamp above already accounts for the new
    // size, and this order avoids a frame at the wrong shape.
    let _ = win.set_size(tauri::LogicalSize::new(w, h));
    let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    let _ = win.set_resizable(true);
    disable_maximize(&win);
}

/// Resize the display window to the current layout's size. Called after the
/// watchlist length changes.
pub fn fit_window_now(app: &AppHandle) {
    let (layout, rows) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        (cfg.layout, cfg.watchlist.len())
    };
    suppress_resize(app, Duration::from_millis(700));
    place_window(app, layout, rows);
}

