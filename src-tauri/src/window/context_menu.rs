//! Native popup context menu for the floating widget.
//!
//! Handles right-click menus on the widget, providing stock-level operations
//! when right-clicking a specific security or system options when right-clicking
//! blank space. Kept under 300 lines (AGENTS.md §11).

use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};

use tauri::{
    menu::{CheckMenuItemBuilder, ContextMenu, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Manager,
};

static IS_SHOWING_MENU: AtomicBool = AtomicBool::new(false);
static LAST_MENU_CLOSED_MILLIS: AtomicI64 = AtomicI64::new(0);

pub fn show_context_menu(
    app: &AppHandle,
    win: &tauri::WebviewWindow,
    stock_code: Option<&str>,
) -> tauri::Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    if now - LAST_MENU_CLOSED_MILLIS.load(Ordering::SeqCst) < 250 {
        return Ok(());
    }
    if IS_SHOWING_MENU
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }

    struct MenuGuard;
    impl Drop for MenuGuard {
        fn drop(&mut self) {
            LAST_MENU_CLOSED_MILLIS.store(chrono::Utc::now().timestamp_millis(), Ordering::SeqCst);
            IS_SHOWING_MENU.store(false, Ordering::SeqCst);
        }
    }
    let _guard = MenuGuard;

    let state = app.state::<crate::state::AppState>();
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let current_layout = cfg.layout;
    let current_mode = cfg.visibility_mode;

    // Find stock item if stock_code is provided
    let stock_item = stock_code.and_then(|c| cfg.watchlist.iter().find(|w| w.code == c).cloned());

    let menu = if let Some(item) = stock_item {
        let code = &item.code;
        let title_label = format!("{} ({})", item.name.as_deref().unwrap_or(code), code);
        let title_item = MenuItemBuilder::with_id("stock:title", title_label)
            .enabled(false)
            .build(app)?;
        let sep_title = tauri::menu::PredefinedMenuItem::separator(app)?;

        // Submenu: 移动到分组
        let current_grp = item.group.as_deref().unwrap_or(crate::config::DEFAULT_GROUP_ID);
        let mut group_sub_builder = SubmenuBuilder::new(app, "移动到分组");
        for grp in &cfg.groups {
            let grp_id = format!("stock:group:{code}:{}", grp.id);
            let is_cur = grp.id == current_grp;
            let item_btn = CheckMenuItemBuilder::with_id(&grp_id, &grp.name)
                .checked(is_cur)
                .build(app)?;
            group_sub_builder = group_sub_builder.item(&item_btn);
        }
        let sep_new_grp = tauri::menu::PredefinedMenuItem::separator(app)?;
        let new_grp_item = MenuItemBuilder::with_id(format!("stock:new_group:{code}"), "+ 新建分组…").build(app)?;
        let group_sub = group_sub_builder.item(&sep_new_grp).item(&new_grp_item).build()?;

        let pin_item = MenuItemBuilder::with_id(format!("stock:pin:{code}"), "设为置顶").build(app)?;
        let remove_item = MenuItemBuilder::with_id(format!("stock:remove:{code}"), "从自选中移除").build(app)?;
        let sep_actions = tauri::menu::PredefinedMenuItem::separator(app)?;

        let trade_item = MenuItemBuilder::with_id(format!("stock:trade:{code}"), "快捷买卖…").build(app)?;
        let settings_item = MenuItemBuilder::with_id(format!("stock:settings:{code}"), "成本与预警设置…").build(app)?;
        let sep_system = tauri::menu::PredefinedMenuItem::separator(app)?;

        // Nested Submenu: 系统菜单
        let sys_refresh = MenuItemBuilder::with_id("refresh", "立即刷新").build(app)?;
        let sys_bar = CheckMenuItemBuilder::with_id("layout:bar", "数字条")
            .checked(current_layout == crate::config::Layout::Bar)
            .build(app)?;
        let sys_mini = CheckMenuItemBuilder::with_id("layout:mini", "迷你图")
            .checked(current_layout == crate::config::Layout::Mini)
            .build(app)?;
        let sys_list = CheckMenuItemBuilder::with_id("layout:list", "列表")
            .checked(current_layout == crate::config::Layout::List)
            .build(app)?;
        let sys_market = CheckMenuItemBuilder::with_id("layout:market", "大盘全景")
            .checked(current_layout == crate::config::Layout::Market)
            .build(app)?;
        let sys_global = CheckMenuItemBuilder::with_id("layout:global", "全球股指")
            .checked(current_layout == crate::config::Layout::Global)
            .build(app)?;
        let sys_settings = MenuItemBuilder::with_id("settings", "设置…").build(app)?;
        let sys_quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

        let sys_sub = SubmenuBuilder::new(app, "系统设置与形态")
            .item(&sys_refresh)
            .separator()
            .item(&sys_bar)
            .item(&sys_mini)
            .item(&sys_list)
            .item(&sys_market)
            .item(&sys_global)
            .separator()
            .item(&sys_settings)
            .item(&sys_quit)
            .build()?;

        MenuBuilder::new(app)
            .items(&[
                &title_item,
                &sep_title,
                &group_sub,
                &pin_item,
                &remove_item,
                &sep_actions,
                &trade_item,
                &settings_item,
                &sep_system,
                &sys_sub,
            ])
            .build()?
    } else {
        // Standard blank-space context menu
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
        let market = CheckMenuItemBuilder::with_id("layout:market", "大盘全景")
            .checked(current_layout == crate::config::Layout::Market)
            .build(app)?;
        let global = CheckMenuItemBuilder::with_id("layout:global", "全球股指")
            .checked(current_layout == crate::config::Layout::Global)
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

        MenuBuilder::new(app)
            .items(&[
                &refresh, &sep1, &bar, &mini, &list, &market, &global, &sep2, &mode_sub, &sep_mode,
                &opacity_sub, &sep_opacity, &settings, &sep_settings, &autostart, &sep3, &quit,
            ])
            .build()?
    };

    #[cfg(windows)]
    let raw_hwnd = win.hwnd().ok().map(|h| h.0);

    #[cfg(windows)]
    let orig_ex = raw_hwnd.map(|raw| {
        use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            GetForegroundWindow, GetWindowLongPtrW, GetWindowThreadProcessId, SetForegroundWindow,
            SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE,
            SWP_NOZORDER, WS_EX_NOACTIVATE,
        };
        unsafe {
            let ex = GetWindowLongPtrW(raw, GWL_EXSTYLE);
            SetWindowLongPtrW(raw, GWL_EXSTYLE, ex & !(WS_EX_NOACTIVATE as isize));
            SetWindowPos(
                raw,
                0 as _,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
            );

            let fg_hwnd = GetForegroundWindow();
            let cur_thread = GetCurrentThreadId();
            let fg_thread = GetWindowThreadProcessId(fg_hwnd, std::ptr::null_mut());
            if fg_thread != 0 && fg_thread != cur_thread {
                AttachThreadInput(cur_thread, fg_thread, 1);
                SetForegroundWindow(raw);
                AttachThreadInput(cur_thread, fg_thread, 0);
            } else {
                SetForegroundWindow(raw);
            }

            ex
        }
    });

    let result = menu.popup(win.as_ref().window().clone());

    #[cfg(windows)]
    if let (Some(raw), Some(orig_ex)) = (raw_hwnd, orig_ex) {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            PostMessageW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WM_NULL,
        };
        unsafe {
            PostMessageW(raw, WM_NULL, 0, 0);
            SetWindowLongPtrW(raw, GWL_EXSTYLE, orig_ex);
            SetWindowPos(
                raw,
                0 as _,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }
    }

    result
}
