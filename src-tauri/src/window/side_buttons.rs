//! Win32 low-level mouse hook for reliable XBUTTON1/XBUTTON2 (shoulder back/forward)
//! handling across both the `WS_EX_NOACTIVATE` floating widget and the Settings window.

#[cfg(windows)]
mod imp {
    use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU16, AtomicU8, Ordering};
    use std::sync::OnceLock;

    use tauri::{AppHandle, Emitter};
    use tokio::sync::mpsc::{self, UnboundedSender};
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetAncestor, SetWindowsHookExW, UnhookWindowsHookEx, WindowFromPoint,
        GA_ROOT, HHOOK, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_XBUTTONDOWN, WM_XBUTTONUP, XBUTTON1,
        XBUTTON2,
    };

    use crate::window::geometry::{DISPLAY, SETTINGS};

    const TARGET_NONE: u8 = 0;
    const TARGET_MAIN: u8 = 1;
    const TARGET_SETTINGS: u8 = 2;

    static MAIN_HWND: AtomicIsize = AtomicIsize::new(0);
    static SETTINGS_HWND: AtomicIsize = AtomicIsize::new(0);
    static MAIN_COLLAPSED: AtomicBool = AtomicBool::new(false);
    static HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);
    static PRESSED_TARGET: AtomicU8 = AtomicU8::new(TARGET_NONE);
    static PRESSED_XBTN: AtomicU16 = AtomicU16::new(0);
    static EVENT_TX: OnceLock<UnboundedSender<(&'static str, &'static str)>> = OnceLock::new();

    pub fn register_side_button_target(label: &str, win: &tauri::WebviewWindow) {
        if let Ok(hwnd) = win.hwnd() {
            let raw = hwnd.0 as isize;
            if label == DISPLAY {
                MAIN_HWND.store(raw, Ordering::Relaxed);
            } else if label == SETTINGS {
                SETTINGS_HWND.store(raw, Ordering::Relaxed);
            }
        }
    }

    pub fn clear_side_button_target(label: &str) {
        if label == DISPLAY {
            MAIN_HWND.store(0, Ordering::Relaxed);
        } else if label == SETTINGS {
            SETTINGS_HWND.store(0, Ordering::Relaxed);
        }
    }

    pub fn set_side_button_main_collapsed(collapsed: bool) {
        MAIN_COLLAPSED.store(collapsed, Ordering::Relaxed);
    }

    pub fn install_side_button_hook(app: &AppHandle) {
        let tx = EVENT_TX.get_or_init(|| {
            let (tx, mut rx) = mpsc::unbounded_channel::<(&'static str, &'static str)>();
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some((label, dir)) = rx.recv().await {
                    log::info!(target: "USER", "鼠标肩键触发: window={label}, dir={dir}");
                    let _ = handle.emit_to(
                        label,
                        "mouse-side-nav",
                        serde_json::json!({ "dir": dir }),
                    );
                }
            });
            tx
        });
        let _ = tx;

        if HOOK_HANDLE.load(Ordering::SeqCst) != 0 {
            return;
        }

        unsafe {
            let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(low_level_mouse_proc), std::ptr::null_mut(), 0);
            if hook.is_null() {
                log::warn!(target: "SYSTEM", "安装鼠标侧键钩子失败，将仅依赖 WebView DOM 事件");
            } else {
                HOOK_HANDLE.store(hook as isize, Ordering::SeqCst);
            }
        }
    }

    pub fn uninstall_side_button_hook() {
        let raw = HOOK_HANDLE.swap(0, Ordering::SeqCst);
        if raw != 0 {
            unsafe {
                UnhookWindowsHookEx(raw as HHOOK);
            }
        }
    }

    unsafe extern "system" fn low_level_mouse_proc(
        n_code: i32,
        w_param: WPARAM,
        l_param: LPARAM,
    ) -> LRESULT {
        if n_code < 0 {
            return CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param);
        }

        let msg = w_param as u32;
        if msg != WM_XBUTTONDOWN && msg != WM_XBUTTONUP {
            return CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param);
        }

        let info = &*(l_param as *const MSLLHOOKSTRUCT);
        let xbtn = ((info.mouseData >> 16) & 0xFFFF) as u16;
        if xbtn != XBUTTON1 && xbtn != XBUTTON2 {
            return CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param);
        }

        let hit = WindowFromPoint(info.pt);
        let root = if !hit.is_null() {
            GetAncestor(hit, GA_ROOT)
        } else {
            std::ptr::null_mut()
        };
        let root_id = root as isize;
        let main_id = MAIN_HWND.load(Ordering::Relaxed);
        let settings_id = SETTINGS_HWND.load(Ordering::Relaxed);

        let target = if root_id != 0 && root_id == main_id {
            TARGET_MAIN
        } else if root_id != 0 && root_id == settings_id {
            TARGET_SETTINGS
        } else {
            TARGET_NONE
        };

        if msg == WM_XBUTTONDOWN {
            if target == TARGET_NONE {
                PRESSED_TARGET.store(TARGET_NONE, Ordering::Relaxed);
                PRESSED_XBTN.store(0, Ordering::Relaxed);
                return CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param);
            }
            PRESSED_TARGET.store(target, Ordering::Relaxed);
            PRESSED_XBTN.store(xbtn, Ordering::Relaxed);
            // Swallow XBUTTONDOWN over our windows so WebView2 / DefWindowProc does not
            // perform native history navigation or bubble APPCOMMAND to the active foreground window.
            return 1;
        }

        // WM_XBUTTONUP
        let prev_target = PRESSED_TARGET.swap(TARGET_NONE, Ordering::Relaxed);
        let prev_xbtn = PRESSED_XBTN.swap(0, Ordering::Relaxed);

        if target == TARGET_NONE {
            return if prev_target != TARGET_NONE {
                1
            } else {
                CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param)
            };
        }

        if target == TARGET_MAIN && MAIN_COLLAPSED.load(Ordering::Relaxed) {
            return 1;
        }

        if prev_target == target && prev_xbtn == xbtn {
            let label = if target == TARGET_MAIN {
                DISPLAY
            } else {
                SETTINGS
            };
            let dir = if xbtn == XBUTTON1 { "back" } else { "forward" };
            if let Some(tx) = EVENT_TX.get() {
                let _ = tx.send((label, dir));
            }
        }
        1
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn register_side_button_target(_label: &str, _win: &tauri::WebviewWindow) {}
    pub fn clear_side_button_target(_label: &str) {}
    pub fn set_side_button_main_collapsed(_collapsed: bool) {}
    pub fn install_side_button_hook(_app: &tauri::AppHandle) {}
    pub fn uninstall_side_button_hook() {}
}

pub use imp::{
    clear_side_button_target, install_side_button_hook, register_side_button_target,
    set_side_button_main_collapsed, uninstall_side_button_hook,
};
