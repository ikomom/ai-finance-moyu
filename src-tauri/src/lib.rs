mod config;
mod crossing;
mod market;
mod poller;
mod quote;
mod state;
mod tray;
mod search;

use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

use config::{Config, DataSource, Hotkeys, Layout, VisibilityMode};
use quote::Fetcher;
use state::{AppState, DockEdge, Snapshot};

/// Label of the floating display window, and of the settings window.
const DISPLAY: &str = "main";
const SETTINGS: &str = "settings";

/// Distance from screen edge to snap and enable dock collapse (in logical px).
const DOCK_SNAP_THRESHOLD: f64 = 60.0;
/// Visible sliver width/thickness when collapsed (in logical px).
const DOCK_HANDLE_THICKNESS: f64 = 10.0;

/// Natural size for a layout, used until the user resizes that layout.
///
/// The bar layout is a horizontal pill, mini is a card chart, list is a compact table.
fn natural_size(layout: Layout, rows: usize) -> (f64, f64) {
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
    }
}

/// The size to apply: whatever the user set for this layout, else the natural
/// size.
fn size_for(layout: Layout, rows: usize, sizes: &config::LayoutSizes) -> (f64, f64) {
    match layout {
        Layout::Bar => {
            let w = sizes
                .get(Layout::Bar)
                .map(|(w, _)| w)
                .unwrap_or_else(|| natural_size(Layout::Bar, rows).0);
            (w.clamp(200.0, 900.0), 32.0)
        }
        Layout::Mini => sizes.get(Layout::Mini).unwrap_or_else(|| natural_size(Layout::Mini, rows)),
        Layout::List => sizes.get(Layout::List).unwrap_or_else(|| natural_size(Layout::List, rows)),
    }
}

/// Size and position the display window, keeping it inside the monitor's usable
/// area.
///
/// The saved position is a *hint*, not a command. On a display narrower than the
/// hint assumes, an unclamped window lands partly or wholly off-screen — which
/// for a widget with `skipTaskbar` and no title bar means it is simply lost, with
/// no way to drag it back.
fn place_window(app: &AppHandle, layout: Layout, rows: usize) {
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
    disable_maximize(&win);
}

/// Switch layout: persist it, resize the window, tell the frontend.
pub fn apply_layout(app: &AppHandle, layout: Layout) {
    let _ = set_dock_collapsed_inner(app, false);

    let (rows, snapshot) = {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        cfg.layout = layout;
        (cfg.watchlist.len(), cfg.clone())
    };
    let _ = config::save(app, &snapshot);

    // The programmatic resize below would otherwise be recorded as a user-chosen
    // size, pinning a layout that should keep auto-sizing.
    suppress_resize(app, Duration::from_millis(700));

    // Re-clamp rather than only resizing: the list layout is much taller than the
    // bar layout, so growing it near the bottom edge would push it off-screen.
    place_window(app, layout, rows);

    poller::emit_snapshot(app);
}

/// Resize the display window to the current layout's size. Called after the
/// watchlist length changes.
fn fit_window_now(app: &AppHandle) {
    let (layout, rows) = {
        let state = app.state::<AppState>();
        let cfg = state.config.lock().unwrap();
        (cfg.layout, cfg.watchlist.len())
    };
    suppress_resize(app, Duration::from_millis(700));
    place_window(app, layout, rows);
}

fn suppress_resize(app: &AppHandle, window: Duration) {
    let state = app.state::<AppState>();
    *state.suppress_resize_until.lock().unwrap() = Some(Instant::now() + window);
}

/// Record a user resize against the current layout, debounced.
///
/// `Resized` fires continuously while a window edge is dragged, so the write is
/// deferred and guarded by a generation counter: only the last event in a burst
/// reaches the config file.
fn on_resized(app: &AppHandle, size: tauri::PhysicalSize<u32>, scale: f64) {
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
    if w < 140.0 || h < 24.0 || w > 750.0 || h > 950.0 {
        return;
    }

    let generation = state.resize_gen.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(450)).await;

        let state = app.state::<AppState>();
        if state.dock_state.lock().unwrap().collapsed {
            return;
        }
        if state.resize_gen.load(std::sync::atomic::Ordering::SeqCst) != generation {
            return;
        }
        let cfg = {
            let mut cfg = state.config.lock().unwrap();
            let layout = cfg.layout;
            if layout == Layout::Bar {
                cfg.layout_sizes.set(Layout::Bar, w.clamp(200.0, 900.0), 32.0);
            } else {
                let (max_w, max_h) = match layout {
                    Layout::Bar => (900.0, 32.0),
                    Layout::Mini => (500.0, 320.0),
                    Layout::List => (700.0, 900.0),
                };
                if w <= max_w && h <= max_h {
                    cfg.layout_sizes.set(layout, w, h);
                }
            }
            cfg.clone()
        };
        if let Err(e) = config::save(&app, &cfg) {
            eprintln!("保存窗口尺寸失败: {e}");
        }
    });
}

fn suppress_move(app: &AppHandle, window: Duration) {
    let state = app.state::<AppState>();
    *state.suppress_move_until.lock().unwrap() = Some(Instant::now() + window);
}

/// Handle window move: detects if user dragged near top/left/right screen edges,
/// snaps position if within threshold, and updates DockState.
fn on_moved(app: &AppHandle, pos: tauri::PhysicalPosition<i32>, scale: f64) {
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

pub fn set_dock_collapsed_inner(app: &AppHandle, collapse: bool) -> Result<(), String> {
    let Some(win) = app.get_webview_window(DISPLAY) else {
        return Ok(());
    };
    let state = app.state::<AppState>();
    let (cfg, current_dock) = {
        let cfg = state.config.lock().unwrap().clone();
        let dock = *state.dock_state.lock().unwrap();
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
            let mut dock = state.dock_state.lock().unwrap();
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
            let mut dock = state.dock_state.lock().unwrap();
            dock.collapsed = false;
        }
    }

    poller::emit_snapshot(app);
    Ok(())
}

pub fn apply_visibility_mode(app: &AppHandle, mode: VisibilityMode) -> Result<(), String> {
    let cfg = {
        let state = app.state::<AppState>();
        let mut cfg = state.config.lock().unwrap();
        cfg.visibility_mode = mode;
        cfg.clone()
    };
    config::save(app, &cfg)?;
    if matches!(mode, VisibilityMode::Always | VisibilityMode::Hotkey) {
        let _ = set_dock_collapsed_inner(app, false);
    }
    poller::emit_snapshot(app);
    Ok(())
}

/// The 老板键 action.
pub fn toggle_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(DISPLAY) {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            let _ = set_dock_collapsed_inner(app, false);
            let _ = win.show();
        }
    }
}

/// Open the settings window, creating it on first use.
///
/// Deliberately a real decorated window: it needs focus for its inputs, it wants
/// a native close button, and it should appear in the taskbar so it can be found
/// again. The display widget is the opposite of all three.
pub fn open_settings(app: &AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(SETTINGS) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        app,
        SETTINGS,
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("设置 · A股摸鱼")
    .inner_size(760.0, 620.0)
    .min_inner_size(680.0, 480.0)
    .center()
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(false)
    .skip_taskbar(false)
    .focused(true)
    .build()
    .map_err(|e| format!("打开设置窗口失败: {e}"))?;

    Ok(())
}

/// Flip the autostart registration and mirror it into the config file.
pub fn toggle_autostart(app: &AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;

    let mut cfg = config::load(app);
    let next = !cfg.autostart;
    let manager = app.autolaunch();
    if next {
        manager.enable().map_err(|e| format!("开启自启失败: {e}"))?;
    } else {
        manager.disable().map_err(|e| format!("关闭自启失败: {e}"))?;
    }
    cfg.autostart = next;
    config::save(app, &cfg)?;
    Ok(next)
}

// ---------------------------------------------------------------- commands

#[tauri::command]
fn get_snapshot(state: tauri::State<AppState>) -> Snapshot {
    state.snapshot()
}

/// Persist a config edited in the settings window. Codes are normalized and
/// out-of-range numbers clamped before anything is written.
#[tauri::command]
fn save_config(app: AppHandle, mut cfg: Config) -> Result<(), String> {
    for item in cfg.watchlist.iter_mut() {
        item.code = market::normalize_code(&item.code)?;
    }
    cfg.sanitize();

    // Autostart lives in the OS, not in the file, so a change made in the
    // settings form has to be pushed out to the registry here.
    {
        use tauri_plugin_autostart::ManagerExt;
        let manager = app.autolaunch();
        let currently = manager.is_enabled().unwrap_or(false);
        if cfg.autostart != currently {
            let result = if cfg.autostart { manager.enable() } else { manager.disable() };
            if let Err(e) = result {
                return Err(format!("设置开机自启失败: {e}"));
            }
        }
    }

    config::save(&app, &cfg)?;
    {
        let state = app.state::<AppState>();
        *state.config.lock().unwrap() = cfg.clone();
    }

    if matches!(cfg.visibility_mode, VisibilityMode::Always | VisibilityMode::Hotkey) {
        let _ = set_dock_collapsed_inner(&app, false);
    }

    // Re-lay-out and refetch: the watchlist or source may have changed.
    apply_layout(&app, cfg.layout);
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = poller::poll_once(&handle).await;
    });
    Ok(())
}

#[tauri::command]
fn set_layout(app: AppHandle, layout: Layout) {
    apply_layout(&app, layout);
}

#[tauri::command]
async fn refresh_now(app: AppHandle) -> Result<(), String> {
    poller::poll_once(&app).await
}

#[tauri::command]
fn fit_window(app: AppHandle) {
    fit_window_now(&app);
}

#[tauri::command]
fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings(&app)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Let a window write into the process log.
///
/// A transparent widget can fail in ways that are invisible on screen, and the
/// webview console is not reachable from the terminal. This bridge makes the
/// frontend's own view of what it rendered observable from the dev log.
#[tauri::command]
fn frontend_log(msg: String) {
    println!("[webview] {msg}");
}

/// Report the provider list so the settings UI stays in sync with the backend.
#[tauri::command]
fn data_sources() -> Vec<(&'static str, &'static str)> {
    vec![
        ("tencent", DataSource::Tencent.label()),
        ("sina", DataSource::Sina.label()),
    ]
}

#[tauri::command]
fn set_dock_collapsed(app: AppHandle, collapsed: bool) -> Result<(), String> {
    set_dock_collapsed_inner(&app, collapsed)
}

#[tauri::command]
fn set_visibility_mode(app: AppHandle, mode: VisibilityMode) -> Result<(), String> {
    apply_visibility_mode(&app, mode)
}

#[tauri::command]
fn show_context_menu(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(DISPLAY) {
        tray::show_context_menu(&app, &win).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn search_securities(query: String) -> Result<Vec<search::SearchResult>, String> {
    let client = search::SearchClient::new()?;
    client.search(&query).await
}

// ------------------------------------------------------------------- setup

/// Register the global shortcuts named in the config.
///
/// Matching compares parsed [`Shortcut`] values, so a chord changed in
/// `config.json` is both registered *and* dispatched correctly — the handler
/// needs no separate table of keys.
fn register_hotkeys(app: &AppHandle, keys: &Hotkeys) -> Result<(), String> {
    fn parse(action: &str, chord: &str) -> Result<Shortcut, String> {
        chord
            .parse::<Shortcut>()
            .map_err(|e| format!("快捷键 {action}=\"{chord}\" 无法解析: {e}"))
    }

    let toggle = parse("toggle", &keys.toggle)?;
    let bar = parse("layoutBar", &keys.layout_bar)?;
    let mini = parse("layoutMini", &keys.layout_mini)?;
    let list = parse("layoutList", &keys.layout_list)?;

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                if shortcut == &toggle {
                    toggle_window(app);
                } else if shortcut == &bar {
                    apply_layout(app, Layout::Bar);
                } else if shortcut == &mini {
                    apply_layout(app, Layout::Mini);
                } else if shortcut == &list {
                    apply_layout(app, Layout::List);
                }
            })
            .build(),
    )
    .map_err(|e| format!("加载快捷键插件失败: {e}"))?;

    // Registered one at a time rather than through `with_shortcuts`, which fails
    // as a batch: a single chord already held by another program would otherwise
    // take the whole set down. A chord we can't have is worth reporting, not
    // worth refusing to start over.
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let shortcuts = app.global_shortcut();
    for (name, chord, shortcut) in [
        ("老板键", keys.toggle.as_str(), toggle),
        ("数字条", keys.layout_bar.as_str(), bar),
        ("迷你图", keys.layout_mini.as_str(), mini),
        ("列表", keys.layout_list.as_str(), list),
    ] {
        if let Err(e) = shortcuts.register(shortcut) {
            eprintln!("快捷键 {name}（{chord}）注册失败，可能已被别的程序占用: {e}");
        }
    }

    Ok(())
}

#[cfg(windows)]
trait WindowHwnd {
    fn raw_hwnd(&self) -> Option<*mut std::ffi::c_void>;
}

#[cfg(windows)]
impl WindowHwnd for tauri::WebviewWindow {
    fn raw_hwnd(&self) -> Option<*mut std::ffi::c_void> {
        self.hwnd().ok().map(|h| h.0)
    }
}

#[cfg(windows)]
impl WindowHwnd for tauri::Window {
    fn raw_hwnd(&self) -> Option<*mut std::ffi::c_void> {
        self.hwnd().ok().map(|h| h.0)
    }
}

/// Strip WS_MAXIMIZEBOX so Windows Aero Snap / Snap Layouts (贴边分屏) does not
/// Strip WS_MAXIMIZEBOX and delete SC_MAXIMIZE so Windows Aero Snap (贴边分屏) and
/// titlebar double-click (双击放大) cannot maximize or expand the widget.
#[cfg(windows)]
fn disable_maximize(win: &impl WindowHwnd) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMenu, DeleteMenu, GetWindowLongPtrW, SetWindowLongPtrW, GWL_STYLE, WS_MAXIMIZEBOX,
        MF_BYCOMMAND, SC_MAXIMIZE,
    };
    if let Some(raw) = win.raw_hwnd() {
        unsafe {
            let style = GetWindowLongPtrW(raw, GWL_STYLE);
            if style & (WS_MAXIMIZEBOX as isize) != 0 {
                SetWindowLongPtrW(raw, GWL_STYLE, style & !(WS_MAXIMIZEBOX as isize));
            }
            let sys_menu = GetSystemMenu(raw, 0);
            if !sys_menu.is_null() {
                DeleteMenu(sys_menu, SC_MAXIMIZE as u32, MF_BYCOMMAND);
            }
        }
    }
}

#[cfg(not(windows))]
fn disable_maximize<T>(_win: &T) {}

/// Take the window out of the Alt+Tab list.
///
/// Tauri's `skipTaskbar` drops the taskbar button but leaves the Alt+Tab entry,
/// so a plain alt-tab would still reveal the widget by name. Leaving both is what
/// `WS_EX_TOOLWINDOW` does, and the window config has no option for it.
///
/// The new style only takes effect on a window that gets re-shown, hence the
/// hide/show around it. `SW_SHOWNA` shows without activating, so applying this
/// during startup can't pull focus.
#[cfg(windows)]
fn hide_from_alt_tab(win: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GWL_EXSTYLE, SW_HIDE, SW_SHOWNA,
        WS_EX_TOOLWINDOW,
    };

    disable_maximize(win);

    // `tauri` and `windows-sys` both type HWND as a raw pointer, so `.0` bridges
    // them without either crate having to know about the other.
    let Ok(hwnd) = win.hwnd() else {
        eprintln!("无法获取窗口句柄，Alt+Tab 隐藏未生效");
        return;
    };
    let raw = hwnd.0;

    unsafe {
        let ex = GetWindowLongPtrW(raw, GWL_EXSTYLE);
        if ex & (WS_EX_TOOLWINDOW as isize) != 0 {
            return; // already tool-windowed
        }
        ShowWindow(raw, SW_HIDE);
        SetWindowLongPtrW(raw, GWL_EXSTYLE, ex | WS_EX_TOOLWINDOW as isize);
        ShowWindow(raw, SW_SHOWNA);
    }
}

#[cfg(not(windows))]
fn hide_from_alt_tab(_win: &tauri::WebviewWindow) {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Someone launched us again — reveal the window that already exists.
            if let Some(win) = app.get_webview_window(DISPLAY) {
                let _ = win.show();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("ai-finance-moyu")
                .build(),
        )
        .setup(|app| {
            let cfg = config::load(app.handle());

            // Registered here rather than in the builder chain so the chords can
            // come from the config file. A failure is reported and survived: the
            // widget is still usable from the tray and the right-click menu, and
            // refusing to start over a hotkey would be far worse.
            if let Err(e) = register_hotkeys(app.handle(), &cfg.hotkeys) {
                eprintln!("{e}（其余功能不受影响）");
            }

            let fetcher = Fetcher::new().map_err(|e| e.to_string())?;
            let rows = cfg.watchlist.len();
            let layout = cfg.layout;
            app.manage(AppState::new(cfg, fetcher));

            tray::build(app)?;

            // Restore the saved geometry, clamped to the current display.
            place_window(app.handle(), layout, rows);

            // Determine initial dock edge from restored position
            if let Some(win) = app.get_webview_window(DISPLAY) {
                let mon = win.current_monitor().ok().flatten().or_else(|| win.primary_monitor().ok().flatten());
                if let Some(mon) = mon {
                    let scale = mon.scale_factor();
                    let mpos = mon.position().to_logical::<f64>(scale);
                    let msize = mon.size().to_logical::<f64>(scale);
                    let state = app.state::<AppState>();
                    let (cfg_x, cfg_y, sizes) = {
                        let c = state.config.lock().unwrap();
                        (c.window.x as f64, c.window.y as f64, c.layout_sizes.clone())
                    };
                    let (w, _h) = size_for(layout, rows, &sizes);
                    let dist_top = (cfg_y - mpos.y).abs();
                    let dist_left = (cfg_x - mpos.x).abs();
                    let dist_right = (mpos.x + msize.width - (cfg_x + w)).abs();

                    let initial_edge = if dist_top <= DOCK_SNAP_THRESHOLD {
                        DockEdge::Top
                    } else if dist_left <= DOCK_SNAP_THRESHOLD {
                        DockEdge::Left
                    } else if dist_right <= DOCK_SNAP_THRESHOLD {
                        DockEdge::Right
                    } else {
                        DockEdge::None
                    };
                    state.dock_state.lock().unwrap().edge = initial_edge;
                }
            }

            // `Tauri` defers showing a transparent window until its webview is
            // ready, and a webview that never signals leaves it hidden forever
            // with no taskbar entry to recover from. Show it explicitly.
            if let Some(win) = app.get_webview_window(DISPLAY) {
                let _ = win.show();
                // Must come after `show()`, since the style needs a re-show to
                // take hold.
                hide_from_alt_tab(&win);
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                poller::run(handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Only the display window's size and dock position are remembered;
            // the settings window manages its own geometry.
            if window.label() != DISPLAY {
                return;
            }
            disable_maximize(window);
            match event {
                WindowEvent::Resized(size) => {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    on_resized(window.app_handle(), *size, scale);
                }
                WindowEvent::Moved(pos) => {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    on_moved(window.app_handle(), *pos, scale);
                }
                WindowEvent::ScaleFactorChanged { .. } => {
                    disable_maximize(window);
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| {
            tray::handle_menu(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            save_config,
            set_layout,
            refresh_now,
            fit_window,
            open_settings_window,
            quit_app,
            frontend_log,
            data_sources,
            set_dock_collapsed,
            set_visibility_mode,
            show_context_menu,
            search_securities,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
