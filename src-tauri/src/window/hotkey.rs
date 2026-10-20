//! Global hotkey registration, chord parsing, and synchronization.

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

use crate::config::{Hotkeys, Layout};
use crate::state::{self, AppState};
use super::visibility::{apply_layout, toggle_window};

/// Register the global shortcuts plugin and sync active chords.
pub fn register_hotkeys(app: &AppHandle, keys: &Hotkeys) -> Result<(), String> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                let state = app.state::<AppState>();
                let bindings = state.hotkey_bindings.lock().unwrap_or_else(|e| e.into_inner()).clone();
                if bindings.toggle.as_ref() == Some(shortcut) {
                    toggle_window(app);
                } else if bindings.bar.as_ref() == Some(shortcut) {
                    apply_layout(app, Layout::Bar);
                } else if bindings.mini.as_ref() == Some(shortcut) {
                    apply_layout(app, Layout::Mini);
                } else if bindings.list.as_ref() == Some(shortcut) {
                    apply_layout(app, Layout::List);
                } else if bindings.market.as_ref() == Some(shortcut) {
                    apply_layout(app, Layout::Market);
                } else if bindings.global.as_ref() == Some(shortcut) {
                    apply_layout(app, Layout::Global);
                }
            })
            .build(),
    )
    .map_err(|e| format!("加载快捷键插件失败: {e}"))?;

    sync_hotkeys(app, keys);
    Ok(())
}

/// Dynamically sync and register hotkeys without restarting the app.
pub fn sync_hotkeys(app: &AppHandle, keys: &Hotkeys) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    fn parse(chord: &str) -> Option<Shortcut> {
        let trimmed = chord.trim();
        if trimmed.is_empty() {
            return None;
        }
        trimmed.parse::<Shortcut>().ok()
    }

    let toggle = parse(&keys.toggle);
    let bar = parse(&keys.layout_bar);
    let mini = parse(&keys.layout_mini);
    let list = parse(&keys.layout_list);
    let market = parse(&keys.layout_market);
    let global = parse(&keys.layout_global);

    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();

    let new_bindings = state::HotkeyBindings {
        toggle,
        bar,
        mini,
        list,
        market,
        global,
    };

    for (name, chord, opt_s) in [
        ("老板键", keys.toggle.as_str(), new_bindings.toggle),
        ("数字条", keys.layout_bar.as_str(), new_bindings.bar),
        ("迷你图", keys.layout_mini.as_str(), new_bindings.mini),
        ("列表", keys.layout_list.as_str(), new_bindings.list),
        ("大盘全景", keys.layout_market.as_str(), new_bindings.market),
        ("全球股指", keys.layout_global.as_str(), new_bindings.global),
    ] {
        if let Some(s) = opt_s {
            if let Err(e) = shortcuts.register(s) {
                log::warn!(target: "SYSTEM", "快捷键 {name}（{chord}）注册失败，可能已被别的程序占用: {e}");
            }
        } else if !chord.trim().is_empty() {
            log::warn!(target: "SYSTEM", "快捷键 {name}（\"{chord}\"）格式无效，无法解析");
        }
    }

    let state = app.state::<AppState>();
    *state.hotkey_bindings.lock().unwrap_or_else(|e| e.into_inner()) = new_bindings;
}

#[cfg(test)]
mod hotkey_tests {
    use super::*;

    #[test]
    fn test_parse_all_hotkeys() {
        let keys = Hotkeys::default();
        let toggle = keys.toggle.parse::<Shortcut>();
        let bar = keys.layout_bar.parse::<Shortcut>();
        let mini = keys.layout_mini.parse::<Shortcut>();
        let list = keys.layout_list.parse::<Shortcut>();
        let market = keys.layout_market.parse::<Shortcut>();
        let global = keys.layout_global.parse::<Shortcut>();

        assert!(toggle.is_ok(), "toggle chord must be valid");
        assert!(bar.is_ok(), "bar chord must be valid");
        assert!(mini.is_ok(), "mini chord must be valid");
        assert!(list.is_ok(), "list chord must be valid");
        assert!(market.is_ok(), "market chord must be valid");
        assert!(global.is_ok(), "global chord must be valid");

        let set = [
            toggle.unwrap(),
            bar.unwrap(),
            mini.unwrap(),
            list.unwrap(),
            market.unwrap(),
            global.unwrap(),
        ];
        // Ensure no chords overlap
        for i in 0..set.len() {
            for j in (i + 1)..set.len() {
                assert_ne!(set[i], set[j], "chords must be unique");
            }
        }
    }
}
