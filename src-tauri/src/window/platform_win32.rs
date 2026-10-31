//! Win32 window style manipulation and taskbar/Alt+Tab suppression.

#[cfg(windows)]
pub trait WindowHwnd {
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

/// Strip WS_MAXIMIZEBOX and delete SC_MAXIMIZE so Windows Aero Snap (贴边分屏) and
/// titlebar double-click (双击放大) cannot maximize or expand the widget.
#[cfg(windows)]
pub fn disable_maximize(win: &impl WindowHwnd) {
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
                DeleteMenu(sys_menu, SC_MAXIMIZE, MF_BYCOMMAND);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn disable_maximize<T>(_win: &T) {}

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
pub fn hide_from_alt_tab(win: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, ShowWindow, GWL_EXSTYLE, SW_HIDE, SW_SHOWNA,
        WS_EX_TOOLWINDOW,
    };

    disable_maximize(win);

    // `tauri` and `windows-sys` both type HWND as a raw pointer, so `.0` bridges
    // them without either crate having to know about the other.
    let Ok(hwnd) = win.hwnd() else {
        log::warn!(target: "SYSTEM", "无法获取窗口句柄，Alt+Tab 隐藏未生效");
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
pub fn hide_from_alt_tab(_win: &tauri::WebviewWindow) {}

/// Pull the window to the foreground even when another app currently owns it.
///
/// The widget runs with `WS_EX_NOACTIVATE` (config `focusable: false`) so moving
/// the mouse over it never steals the keyboard from whatever the user is typing
/// in. The side effect is that Windows does not treat a click on us as user
/// input, so while that flag is on `SetForegroundWindow` is refused. Callers must
/// drop the flag first; this then takes care of the foreground lock itself.
#[cfg(windows)]
pub fn force_foreground(win: &tauri::WebviewWindow) {
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow, SetWindowPos,
        SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    };

    let Some(raw) = win.raw_hwnd() else {
        return;
    };

    unsafe {
        // Re-apply the frame so the style change is visible to the window manager
        // before we ask for the foreground.
        SetWindowPos(
            raw,
            0 as _,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        );

        let fg = GetForegroundWindow();
        let cur = GetCurrentThreadId();
        let fg_thread = GetWindowThreadProcessId(fg, std::ptr::null_mut());
        if fg_thread != 0 && fg_thread != cur {
            // Attaching to the foreground thread's input queue is what lifts the
            // "only the active app may raise a window" restriction.
            AttachThreadInput(cur, fg_thread, 1);
            SetForegroundWindow(raw);
            AttachThreadInput(cur, fg_thread, 0);
        } else {
            SetForegroundWindow(raw);
        }
    }
}

#[cfg(not(windows))]
pub fn force_foreground(_win: &tauri::WebviewWindow) {}
