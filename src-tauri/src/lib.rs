pub mod auction_engine;
pub mod commands;
mod config;
mod crossing;
pub mod logger;
mod market;
pub mod market_overview;
mod poller;
mod quote;
mod search;
mod state;
mod tray;
mod trend_engine;
pub mod window;

use std::time::Duration;

use tauri::{Manager, WindowEvent};

use quote::Fetcher;
use state::{AppState, DockEdge};
pub use window::{apply_layout, apply_visibility_mode, navigate_to_stock_mini, open_settings, toggle_autostart, toggle_window};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Someone launched us again — reveal the window that already exists.
            if let Some(win) = app.get_webview_window(window::DISPLAY) {
                let _ = win.show();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("ai-finance-moyu")
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            if let Err(e) = logger::init(app.handle()) {
                eprintln!("初始化日志系统失败: {e}");
            }

            let cfg = config::load(app.handle());
            let fetcher = Fetcher::new().map_err(|e| e.to_string())?;
            let cache = config::load_cache(app.handle());
            let rows = cfg.watchlist.len();
            let layout = cfg.layout;
            let hotkeys = cfg.hotkeys.clone();
            app.manage(AppState::new(cfg, fetcher, cache));

            // Registered here rather than in the builder chain so the chords can
            // come from the config file. A failure is reported and survived: the
            // widget is still usable from the tray and the right-click menu, and
            // refusing to start over a hotkey would be far worse.
            if let Err(e) = window::register_hotkeys(app.handle(), &hotkeys) {
                log::warn!(target: "SYSTEM", "{e}（其余功能不受影响）");
            }

            tray::build(app)?;

            // Restore the saved geometry, clamped to the current display.
            window::suppress_resize(app.handle(), Duration::from_millis(700));
            window::place_window(app.handle(), layout, rows);

            // Determine initial dock edge from restored position
            if let Some(win) = app.get_webview_window(window::DISPLAY) {
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
                    let (w, _h) = window::size_for(layout, rows, &sizes);
                    let dist_top = (cfg_y - mpos.y).abs();
                    let dist_left = (cfg_x - mpos.x).abs();
                    let dist_right = (mpos.x + msize.width - (cfg_x + w)).abs();

                    let initial_edge = if dist_top <= window::DOCK_SNAP_THRESHOLD {
                        DockEdge::Top
                    } else if dist_left <= window::DOCK_SNAP_THRESHOLD {
                        DockEdge::Left
                    } else if dist_right <= window::DOCK_SNAP_THRESHOLD {
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
            if let Some(win) = app.get_webview_window(window::DISPLAY) {
                let _ = win.show();
                // Must come after `show()`, since the style needs a re-show to take hold.
                window::hide_from_alt_tab(&win);
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                poller::run(handle).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == window::SETTINGS {
                if let WindowEvent::Focused(focused) = event {
                    let _ = window.set_always_on_top(*focused);
                }
                return;
            }
            if window.label() != window::DISPLAY {
                return;
            }
            window::disable_maximize(window);
            match event {
                WindowEvent::Resized(size) => {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    window::on_resized(window.app_handle(), *size, scale);
                }
                WindowEvent::Moved(pos) => {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    window::on_moved(window.app_handle(), *pos, scale);
                }
                WindowEvent::ScaleFactorChanged { .. } => {
                    window::disable_maximize(window);
                }
                _ => {}
            }
        })
        .on_menu_event(|app, event| {
            tray::handle_menu(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_snapshot,
            commands::save_config,
            commands::set_layout,
            commands::refresh_now,
            commands::fit_window,
            commands::open_settings_window,
            commands::quit_app,
            commands::frontend_log,
            commands::data_sources,
            commands::set_dock_collapsed,
            commands::set_visibility_mode,
            commands::show_context_menu,
            commands::search_securities,
            commands::set_trend_targets,
            commands::get_kline,
            commands::get_global_kline,
            commands::get_global_trend,
            commands::get_recent_logs,
            commands::open_log_dir,
            commands::open_url,
            commands::download_and_install_package,
            commands::clear_memory_logs,
            commands::set_log_level,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
