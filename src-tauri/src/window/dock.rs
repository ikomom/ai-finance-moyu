//! Window edge docking, snapping, and thin handle collapse/expand mechanisms.

use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::config::Layout;
use crate::poller;
use crate::state::{AppState, DockEdge};
use super::geometry::{size_for, suppress_move, suppress_resize, DISPLAY, DOCK_HANDLE_THICKNESS};
use super::platform_win32::disable_maximize;

pub fn set_dock_collapsed_inner(app: &AppHandle, collapse: bool) -> Result<(), String> {
    let Some(win) = app.get_webview_window(DISPLAY) else {
        return Ok(());
    };
    let state = app.state::<AppState>();
    let (cfg, current_dock) = {
        let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
        let dock = *state.dock_state.lock().unwrap_or_else(|e| e.into_inner());
        (cfg, dock)
    };

    if current_dock.edge == DockEdge::None || current_dock.collapsed == collapse {
        return Ok(());
    }

    let monitor = win
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| win.primary_monitor().ok().flatten())
        .ok_or_else(|| "无法获取显示器".to_string())?;
    let scale = monitor.scale_factor();
    let mpos = monitor.position().to_logical::<f64>(scale);
    let msize = monitor.size().to_logical::<f64>(scale);
    let (w, h) = size_for(cfg.layout, cfg.watchlist.len(), &cfg.layout_sizes);

    let normal_x = cfg.window.x as f64;
    let normal_y = cfg.window.y as f64;

    suppress_move(app, Duration::from_millis(500));
    suppress_resize(app, Duration::from_millis(500));

    if collapse {
        // On Windows, check physical mouse button & cursor position near resize border
        #[cfg(windows)]
        {
            use windows_sys::Win32::Foundation::POINT;
            use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
            use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

            // If mouse button is held down (user dragging to resize or move), do not collapse!
            unsafe {
                if (GetAsyncKeyState(VK_LBUTTON as i32) as u16 & 0x8000) != 0 {
                    return Ok(());
                }
            }

            // If cursor is on the window or precisely on the resize border (within 3px), do not collapse!
            if let (Ok(pos), Ok(size)) = (win.outer_position(), win.inner_size()) {
                unsafe {
                    let mut pt = POINT { x: 0, y: 0 };
                    if GetCursorPos(&mut pt) != 0 {
                        // Tight 3px margin: only covers the actual resize border.
                        // Moving 4px outside the visible card edge immediately allows collapse.
                        let margin = 3;
                        let left = pos.x - margin;
                        let right = pos.x + size.width as i32 + margin;
                        let top = pos.y - margin;
                        let bottom = pos.y + size.height as i32 + margin;
                        let inside = pt.x >= left && pt.x <= right && pt.y >= top && pt.y <= bottom;
                        if inside {
                            return Ok(());
                        }
                    }
                }
            }
        }

        let (cw, ch, cx, cy) = match current_dock.edge {
            DockEdge::Right => (
                DOCK_HANDLE_THICKNESS,
                h,
                mpos.x + msize.width - DOCK_HANDLE_THICKNESS,
                normal_y,
            ),
            DockEdge::Left => (
                DOCK_HANDLE_THICKNESS,
                h,
                mpos.x,
                normal_y,
            ),
            DockEdge::Top => (
                w,
                DOCK_HANDLE_THICKNESS,
                normal_x,
                mpos.y,
            ),
            DockEdge::None => (w, h, normal_x, normal_y),
        };

        // Disable resize tracking so Windows doesn't clamp width to SM_CXMINTRACK (136px)
        let _ = win.set_resizable(false);
        // Shrink size FIRST, then adjust position: guarantees window never spills
        // across monitor boundaries onto adjacent screens at any point!
        let _ = win.set_size(tauri::LogicalSize::new(cw, ch));
        let _ = win.set_position(tauri::LogicalPosition::new(cx, cy));

        {
            let mut dock = state.dock_state.lock().unwrap_or_else(|e| e.into_inner());
            dock.collapsed = true;
        }
    } else {
        let (expanded_x, expanded_y) = match current_dock.edge {
            DockEdge::Right => (mpos.x + msize.width - w, normal_y),
            DockEdge::Left => (mpos.x, normal_y),
            DockEdge::Top => (normal_x, mpos.y),
            DockEdge::None => (normal_x, normal_y),
        };

        // When expanding: move position towards interior FIRST, then expand size,
        // again ensuring coordinates stay strictly within current monitor bounds.
        let _ = win.set_position(tauri::LogicalPosition::new(expanded_x, expanded_y));
        let _ = win.set_size(tauri::LogicalSize::new(w, h));
        let _ = win.set_resizable(true);
        disable_maximize(&win);

        {
            let mut dock = state.dock_state.lock().unwrap_or_else(|e| e.into_inner());
            dock.collapsed = false;
        }

        let is_mini = {
            let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
            cfg.layout == Layout::Mini
        };
        if is_mini {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = poller::poll_trends(&handle).await;
            });
        }
    }

    poller::emit_snapshot(app);
    Ok(())
}
