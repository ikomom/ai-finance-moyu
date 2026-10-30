//! System tray icon and menu. The only way to reach the app when the floating
//! window is hidden or off-screen.

use tauri::{
    menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
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
    let market = MenuItemBuilder::with_id("layout:market", "布局 · 大盘全景").build(app)?;
    let global = MenuItemBuilder::with_id("layout:global", "布局 · 全球股指").build(app)?;
    let sep2 = tauri::menu::PredefinedMenuItem::separator(app)?;

    let mode_sub = SubmenuBuilder::new(app, "显隐模式")
        .item(&MenuItemBuilder::with_id("mode:always", "常驻显示").build(app)?)
        .item(&MenuItemBuilder::with_id("mode:hover", "鼠标悬停展开").build(app)?)
        .item(&MenuItemBuilder::with_id("mode:dblclick", "双击把手展开").build(app)?)
        .item(&MenuItemBuilder::with_id("mode:hotkey", "仅快捷键控制").build(app)?)
        .build()?;
    let sep_mode = tauri::menu::PredefinedMenuItem::separator(app)?;

    let settings = MenuItemBuilder::with_id("settings", "设置…").build(app)?;
    let check_update = MenuItemBuilder::with_id("check_update", "检查更新…").build(app)?;
    let sep_settings = tauri::menu::PredefinedMenuItem::separator(app)?;

    let autostart = CheckMenuItemBuilder::with_id("autostart", "开机自启")
        .checked(config::load(app.handle()).autostart)
        .build(app)?;
    let sep3 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &toggle, &refresh, &sep1, &bar, &mini, &list, &market, &global, &sep2, &mode_sub, &sep_mode, &settings,
            &check_update, &sep_settings, &autostart, &sep3, &quit,
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
        .on_tray_icon_event(|tray, event| {
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

fn deferred<F>(app: &AppHandle, what: &'static str, open: F)
where
    F: FnOnce(AppHandle) -> Result<(), String> + Send + 'static,
{
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = open(handle) {
            log::warn!(target: "SYSTEM", "打开{what}窗口失败: {e}");
        }
    });
}

pub fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "toggle" => crate::toggle_window(app),
        "settings" => deferred(app, "设置", |h| crate::open_settings(&h)),
        "check_update" => {
            deferred(app, "设置", |h| crate::open_settings(&h));
            let _ = app.emit("trigger-check-update", ());
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
                "market" => crate::config::Layout::Market,
                "global" => crate::config::Layout::Global,
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
                    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
                    cfg.opacity = opacity;
                    cfg.clone()
                };
                let _ = config::save(app, &cfg);
                poller::emit_snapshot(app);
            }
        }
        other if other.starts_with("stock:group:") => {
            let rest = other.trim_start_matches("stock:group:");
            if let Some((code, group_id)) = rest.split_once(':') {
                let state = app.state::<crate::state::AppState>();
                let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(item) = cfg.watchlist.iter_mut().find(|w| w.code == code) {
                    item.group = Some(group_id.to_string());
                }
                let _ = config::save(app, &cfg);
                drop(cfg);
                poller::emit_snapshot(app);
                log::info!(target: "USER", "右键移动股票 {code} 至分组 {group_id}");
            }
        }
        other if other.starts_with("stock:new_group:") => {
            let code = other.trim_start_matches("stock:new_group:");
            let _ = app.emit("open-new-group-modal", serde_json::json!({ "code": code }));
        }
        other if other.starts_with("stock:pin:") => {
            let code = other.trim_start_matches("stock:pin:");
            let state = app.state::<crate::state::AppState>();
            let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(pos) = cfg.watchlist.iter().position(|w| w.code == code) {
                let item = cfg.watchlist.remove(pos);
                cfg.watchlist.insert(0, item);
            }
            let _ = config::save(app, &cfg);
            drop(cfg);
            poller::emit_snapshot(app);
            log::info!(target: "USER", "右键置顶股票 {code}");
        }
        other if other.starts_with("stock:remove:") => {
            let code = other.trim_start_matches("stock:remove:");
            let state = app.state::<crate::state::AppState>();
            let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
            cfg.watchlist.retain(|w| w.code != code);
            let _ = config::save(app, &cfg);
            drop(cfg);
            poller::emit_snapshot(app);
            log::info!(target: "USER", "右键移除股票 {code}");
        }
        other if other.starts_with("stock:trade:") => {
            let code = other.trim_start_matches("stock:trade:");
            let _ = app.emit("trigger-open-trade", serde_json::json!({ "code": code }));
        }
        other if other.starts_with("stock:settings:") => {
            let code = other.trim_start_matches("stock:settings:").to_string();
            deferred(app, "设置", move |h| {
                crate::open_settings(&h)?;
                let _ = h.emit("select-watch-item", serde_json::json!({ "code": code }));
                Ok(())
            });
        }
        _ => {}
    }
}
