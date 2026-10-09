//! System tray icon and menu. The only way to reach the app when the floating
//! window is hidden or off-screen.

use tauri::{
    menu::{CheckMenuItemBuilder, ContextMenu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager,
};

use crate::config;
use crate::poller;

pub fn build(app: &App) -> tauri::Result<()> {
    let toggle = MenuItemBuilder::with_id("toggle", "显示 / 隐藏").build(app)?;
    let refresh = MenuItemBuilder::with_id("refresh", "立即刷新").build(app)?;
    let sep1 = tauri::menu::PredefinedMenuItem::separator(app)?;

    let bar = MenuItemBuilder::with_id("layout:bar", "布局 · 数字条").build(app)?;
    let mini = MenuItemBuilder::with_id("layout:mini", "布局 · 迷你图").build(app)?;
    let list = MenuItemBuilder::with_id("layout:list", "布局 · 列表").build(app)?;
    let sep2 = tauri::menu::PredefinedMenuItem::separator(app)?;

    let mode_sub = SubmenuBuilder::new(app, "显隐模式")
        .item(&MenuItemBuilder::with_id("mode:always", "常驻显示").build(app)?)
        .item(&MenuItemBuilder::with_id("mode:hover", "鼠标悬停展开").build(app)?)
        .item(&MenuItemBuilder::with_id("mode:dblclick", "双击把手展开").build(app)?)
        .item(&MenuItemBuilder::with_id("mode:hotkey", "仅快捷键控制").build(app)?)
        .build()?;
    let sep_mode = tauri::menu::PredefinedMenuItem::separator(app)?;

    let settings = MenuItemBuilder::with_id("settings", "设置…").build(app)?;
    let sep_settings = tauri::menu::PredefinedMenuItem::separator(app)?;

    let autostart = CheckMenuItemBuilder::with_id("autostart", "开机自启")
        .checked(config::load(app.handle()).autostart)
        .build(app)?;
    let sep3 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &toggle, &refresh, &sep1, &bar, &mini, &list, &sep2, &mode_sub, &sep_mode, &settings, &sep_settings,
            &autostart, &sep3, &quit,
        ])
        .build()?;

    let source = config::load(app.handle()).data_source.label();

    let icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
            .or_else(|_| tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")))
            .expect("embedded tray icon must parse")
    });

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip(format!("A股摸鱼 · 数据源 {source}"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            // Left click toggles the window, the familiar tray behaviour.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::toggle_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "toggle" => crate::toggle_window(app),
        "settings" => {
            if let Err(e) = crate::open_settings(app) {
                eprintln!("{e}");
            }
        }
        "quit" => app.exit(0),
        "refresh" => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = poller::poll_once(&handle).await;
            });
        }
        "autostart" => {
            let _ = crate::toggle_autostart(app);
        }
        other if other.starts_with("layout:") => {
            let layout = match other.trim_start_matches("layout:") {
                "bar" => crate::config::Layout::Bar,
                "list" => crate::config::Layout::List,
                _ => crate::config::Layout::Mini,
            };
            crate::apply_layout(app, layout);
        }
        other if other.starts_with("mode:") => {
            let mode = match other.trim_start_matches("mode:") {
                "hover" => crate::config::VisibilityMode::Hover,
                "dblclick" => crate::config::VisibilityMode::DblClick,
                "hotkey" => crate::config::VisibilityMode::Hotkey,
                _ => crate::config::VisibilityMode::Always,
            };
            let _ = crate::apply_visibility_mode(app, mode);
        }
        other if other.starts_with("opacity:") => {
            if let Ok(pct) = other.trim_start_matches("opacity:").parse::<f64>() {
                let opacity = pct / 100.0;
                let cfg = {
                    let state = app.state::<crate::state::AppState>();
                    let mut cfg = state.config.lock().unwrap();
                    cfg.opacity = opacity;
                    cfg.clone()
                };
                let _ = config::save(app, &cfg);
                poller::emit_snapshot(app);
            }
        }
        _ => {}
    }
}

pub fn show_context_menu(app: &AppHandle, win: &tauri::WebviewWindow) -> tauri::Result<()> {
    let state = app.state::<crate::state::AppState>();
    let cfg = state.config.lock().unwrap().clone();
    let current_layout = cfg.layout;
    let current_mode = cfg.visibility_mode;

    let refresh = MenuItemBuilder::with_id("refresh", "立即刷新").build(app)?;
    let sep1 = tauri::menu::PredefinedMenuItem::separator(app)?;

    let bar = CheckMenuItemBuilder::with_id("layout:bar", "数字条")
        .checked(current_layout == crate::config::Layout::Bar)
        .build(app)?;
    let mini = CheckMenuItemBuilder::with_id("layout:mini", "迷你图")
        .checked(current_layout == crate::config::Layout::Mini)
        .build(app)?;
    let list = CheckMenuItemBuilder::with_id("layout:list", "列表")
        .checked(current_layout == crate::config::Layout::List)
        .build(app)?;
    let sep2 = tauri::menu::PredefinedMenuItem::separator(app)?;

    let mode_sub = SubmenuBuilder::new(app, "显隐模式")
        .item(&CheckMenuItemBuilder::with_id("mode:always", "常驻显示").checked(current_mode == crate::config::VisibilityMode::Always).build(app)?)
        .item(&CheckMenuItemBuilder::with_id("mode:hover", "鼠标悬停展开").checked(current_mode == crate::config::VisibilityMode::Hover).build(app)?)
        .item(&CheckMenuItemBuilder::with_id("mode:dblclick", "双击把手展开").checked(current_mode == crate::config::VisibilityMode::DblClick).build(app)?)
        .item(&CheckMenuItemBuilder::with_id("mode:hotkey", "仅快捷键控制").checked(current_mode == crate::config::VisibilityMode::Hotkey).build(app)?)
        .build()?;
    let sep_mode = tauri::menu::PredefinedMenuItem::separator(app)?;

    let opacity_sub = SubmenuBuilder::new(app, "透明度")
        .item(&MenuItemBuilder::with_id("opacity:100", "100%").build(app)?)
        .item(&MenuItemBuilder::with_id("opacity:85", "85%").build(app)?)
        .item(&MenuItemBuilder::with_id("opacity:70", "70%").build(app)?)
        .item(&MenuItemBuilder::with_id("opacity:50", "50%").build(app)?)
        .build()?;
    let sep_opacity = tauri::menu::PredefinedMenuItem::separator(app)?;

    let settings = MenuItemBuilder::with_id("settings", "自选股与设置…").build(app)?;
    let sep_settings = tauri::menu::PredefinedMenuItem::separator(app)?;

    let autostart = CheckMenuItemBuilder::with_id("autostart", "开机自启")
        .checked(cfg.autostart)
        .build(app)?;
    let sep3 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &refresh, &sep1, &bar, &mini, &list, &sep2, &mode_sub, &sep_mode,
            &opacity_sub, &sep_opacity, &settings, &sep_settings, &autostart, &sep3, &quit,
        ])
        .build()?;

    menu.popup(win.as_ref().window().clone())?;
    Ok(())
}

