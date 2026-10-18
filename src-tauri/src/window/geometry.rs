//! Window geometry, sizing, clamping to screen boundaries, and move/resize debounce.

use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::config::{self, Layout, LayoutSizes};
use crate::poller;
use crate::state::{AppState, DockEdge};
use super::platform_win32::disable_maximize;

/// Label of the floating display window, and of the settings window.
pub const DISPLAY: &str = "main";
pub const SETTINGS: &str = "settings";

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
        let cfg = state.config.lock().unwrap();
        let dock = *state.dock_state.lock().unwrap();
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
        let cfg = state.config.lock().unwrap();
        (cfg.layout, cfg.watchlist.len())
    };
    suppress_resize(app, Duration::from_millis(700));
    place_window(app, layout, rows);
}

pub fn suppress_resize(app: &AppHandle, window: Duration) {
    let state = app.state::<AppState>();
    *state.suppress_resize_until.lock().unwrap() = Some(Instant::now() + window);
}

/// Record a user resize against the current layout, debounced.
pub fn on_resized(app: &AppHandle, size: tauri::PhysicalSize<u32>, scale: f64) {
    let state = app.state::<AppState>();

    if let Some(win) = app.get_webview_window(DISPLAY) {
        if win.is_maximized().unwrap_or(false) {
            let _ = win.unmaximize();
            return;
        }
    }

    // Never record user resize while the window is collapsed or animating!
    if state.dock_state.lock().unwrap().collapsed {
        return;
    }

    if let Some(until) = *state.suppress_resize_until.lock().unwrap() {
        if Instant::now() < until {
            return;
        }
    }

    let (w, h) = (size.width as f64 / scale, size.height as f64 / scale);
    // Ignore degenerate sizes or OS snap blowout.
    if w < 140.0 || h < 24.0 || w > 1600.0 || h > 1400.0 {
        return;
    }

    // Immediately commit the dragged size to live memory state so any subsequent
    // edge dock collapse or uncollapse immediately has the fresh size!
    {
        let mut cfg = state.config.lock().unwrap();
        let layout = cfg.layout;
        if layout == Layout::Bar {
            cfg.layout_sizes.set(Layout::Bar, w.clamp(180.0, 1400.0), 32.0);
        } else {
            let (max_w, max_h) = match layout {
                Layout::Bar => (1400.0, 32.0),
                Layout::Mini => (1200.0, 900.0),
                Layout::List => (1400.0, 1200.0),
                Layout::Market => (1200.0, 900.0),
                Layout::Global => (1200.0, 900.0),
            };
            if w <= max_w && h <= max_h {
                cfg.layout_sizes.set(layout, w, h);
            }
        }
    }

    let generation = state.resize_gen.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(300)).await;

        let state = app.state::<AppState>();
        if state.resize_gen.load(std::sync::atomic::Ordering::SeqCst) != generation {
            return;
        }
        let cfg = {
            let cfg = state.config.lock().unwrap();
            cfg.clone()
        };
        if let Err(e) = config::save(&app, &cfg) {
            log::warn!(target: "SYSTEM", "保存窗口尺寸失败: {e}");
        }
    });
}

pub fn suppress_move(app: &AppHandle, window: Duration) {
    let state = app.state::<AppState>();
    *state.suppress_move_until.lock().unwrap() = Some(Instant::now() + window);
}

/// Handle window move: detects if user dragged near top/left/right screen edges,
/// snaps position if within threshold, and updates DockState.
pub fn on_moved(app: &AppHandle, pos: tauri::PhysicalPosition<i32>, scale: f64) {
    let state = app.state::<AppState>();

    // While collapsed, the window is sitting in its edge handle; ignore move events!
    if state.dock_state.lock().unwrap().collapsed {
        return;
    }

    if let Some(until) = *state.suppress_move_until.lock().unwrap() {
        if Instant::now() < until {
            return;
        }
    }

    let generation = state.move_gen.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(150)).await;

        let state = app.state::<AppState>();
        if state.dock_state.lock().unwrap().collapsed {
            return;
        }
        if state.move_gen.load(std::sync::atomic::Ordering::SeqCst) != generation {
            return;
        }

        let Some(win) = app.get_webview_window(DISPLAY) else {
            return;
        };

        let monitor = win
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| win.primary_monitor().ok().flatten());
        let Some(mon) = monitor else {
            return;
        };

        let mscale = mon.scale_factor();
        let mpos = mon.position().to_logical::<f64>(mscale);
        let msize = mon.size().to_logical::<f64>(mscale);

        // Fetch the fresh position directly from the window at the moment debounce settles
        let (pos_x, pos_y) = match win.outer_position() {
            Ok(p) => (p.x as f64 / mscale, p.y as f64 / mscale),
            Err(_) => (pos.x as f64 / scale, pos.y as f64 / scale),
        };

        let (w, h) = win
            .inner_size()
            .map(|s| (s.width as f64 / mscale, s.height as f64 / mscale))
            .unwrap_or_else(|_| {
                let cfg = state.config.lock().unwrap();
                size_for(cfg.layout, cfg.watchlist.len(), &cfg.layout_sizes)
            });

        let left_delta = pos_x - mpos.x;
        let right_delta = (mpos.x + msize.width) - (pos_x + w);
        let top_delta = pos_y - mpos.y;

        // Allow snap even if dragged past the monitor edge
        let near_left = left_delta <= DOCK_SNAP_THRESHOLD && left_delta >= -w * 0.7;
        let near_right = right_delta <= DOCK_SNAP_THRESHOLD && right_delta >= -w * 0.7;
        let near_top = top_delta <= DOCK_SNAP_THRESHOLD && top_delta >= -h * 0.7;

        let edge = if near_left || near_right || near_top {
            let mut candidates = Vec::new();
            if near_left {
                candidates.push((DockEdge::Left, left_delta.abs()));
            }
            if near_right {
                candidates.push((DockEdge::Right, right_delta.abs()));
            }
            if near_top {
                candidates.push((DockEdge::Top, top_delta.abs()));
            }
            candidates.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
            candidates.first().map(|c| c.0).unwrap_or(DockEdge::None)
        } else {
            DockEdge::None
        };

        let (snap_x, snap_y) = match edge {
            DockEdge::Left => (
                mpos.x,
                pos_y.clamp(mpos.y, (mpos.y + msize.height - h).max(mpos.y)),
            ),
            DockEdge::Right => (
                mpos.x + msize.width - w,
                pos_y.clamp(mpos.y, (mpos.y + msize.height - h).max(mpos.y)),
            ),
            DockEdge::Top => (
                pos_x.clamp(mpos.x, (mpos.x + msize.width - w).max(mpos.x)),
                mpos.y,
            ),
            DockEdge::None => (pos_x, pos_y),
        };

        if edge != DockEdge::None {
            suppress_move(&app, Duration::from_millis(400));
            let _ = win.set_position(tauri::LogicalPosition::new(snap_x, snap_y));
        }

        let cfg = {
            let mut cfg = state.config.lock().unwrap();
            cfg.window.x = snap_x.round() as i32;
            cfg.window.y = snap_y.round() as i32;
            let mut dock = state.dock_state.lock().unwrap();
            dock.edge = edge;
            dock.collapsed = false;
            cfg.clone()
        };
        let _ = config::save(&app, &cfg);
        poller::emit_snapshot(&app);
    });
}
