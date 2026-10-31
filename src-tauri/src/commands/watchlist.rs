//! Watchlist groups & security operations IPC commands.
//!
//! Kept in its own module to observe AGENTS.md §11 (anti-bloat & 300-line budget).

use tauri::{AppHandle, Manager};

use crate::config::{self, Config, WatchGroup, ALL_GROUP_ID, DEFAULT_GROUP_ID};
use crate::poller;
use crate::state::AppState;

pub fn add_group_inner(cfg: &mut Config, name: &str) -> Result<WatchGroup, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("分组名称不能为空".to_string());
    }
    if cfg.groups.iter().any(|g| g.name == trimmed) {
        return Err(format!("已存在名为「{trimmed}」的分组"));
    }
    let id = format!("grp_{}", chrono::Utc::now().timestamp_millis());
    let new_group = WatchGroup::new(id, trimmed);
    cfg.groups.push(new_group.clone());
    Ok(new_group)
}

pub fn rename_group_inner(cfg: &mut Config, id: &str, name: &str) -> Result<(), String> {
    if id == DEFAULT_GROUP_ID || id == ALL_GROUP_ID {
        return Err("系统默认分组不可修改名称".to_string());
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("分组名称不能为空".to_string());
    }
    if cfg.groups.iter().any(|g| g.id != id && g.name == trimmed) {
        return Err(format!("已存在名为「{trimmed}」的分组"));
    }
    if let Some(group) = cfg.groups.iter_mut().find(|g| g.id == id) {
        group.name = trimmed.to_string();
        Ok(())
    } else {
        Err(format!("未找到 ID 为「{id}」的分组"))
    }
}

pub fn delete_group_inner(cfg: &mut Config, id: &str, move_to_default: bool) -> Result<(), String> {
    if id == DEFAULT_GROUP_ID || id == ALL_GROUP_ID {
        return Err("默认分组不可删除".to_string());
    }
    let initial_count = cfg.groups.len();
    cfg.groups.retain(|g| g.id != id);
    if cfg.groups.len() == initial_count {
        return Err(format!("未找到 ID 为「{id}」的分组"));
    }

    if move_to_default {
        for item in cfg.watchlist.iter_mut() {
            if item.group.as_deref() == Some(id) {
                item.group = Some(DEFAULT_GROUP_ID.to_string());
            }
        }
    } else {
        cfg.watchlist.retain(|item| item.group.as_deref() != Some(id));
    }

    if cfg.active_group_id.as_deref() == Some(id) {
        cfg.active_group_id = None;
    }
    cfg.sanitize();
    Ok(())
}

pub fn move_item_inner(cfg: &mut Config, code: &str, target_group: &str) -> Result<(), String> {
    if !cfg.groups.iter().any(|g| g.id == target_group) {
        return Err(format!("未找到目标分组「{target_group}」"));
    }
    if let Some(item) = cfg.watchlist.iter_mut().find(|w| w.code == code) {
        item.group = Some(target_group.to_string());
        Ok(())
    } else {
        Err(format!("自选列表中未找到「{code}」"))
    }
}

pub fn pin_item_inner(cfg: &mut Config, code: &str) -> Result<(), String> {
    if let Some(pos) = cfg.watchlist.iter().position(|w| w.code == code) {
        let item = cfg.watchlist.remove(pos);
        cfg.watchlist.insert(0, item);
        Ok(())
    } else {
        Err(format!("自选列表中未找到「{code}」"))
    }
}

pub fn remove_item_inner(cfg: &mut Config, code: &str) -> Result<(), String> {
    cfg.watchlist.retain(|w| w.code != code);
    Ok(())
}

#[tauri::command]
pub fn create_watch_group(app: AppHandle, name: String) -> Result<WatchGroup, String> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    let new_group = add_group_inner(&mut cfg, &name)?;
    config::save(&app, &cfg)?;
    drop(cfg);
    poller::emit_snapshot(&app);
    log::info!(target: "USER", "创建自选股新分组: {name}");
    Ok(new_group)
}

#[tauri::command]
pub fn rename_watch_group(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    rename_group_inner(&mut cfg, &id, &name)?;
    config::save(&app, &cfg)?;
    drop(cfg);
    poller::emit_snapshot(&app);
    log::info!(target: "USER", "重命名自选股分组 {id} -> {name}");
    Ok(())
}

#[tauri::command]
pub fn delete_watch_group(app: AppHandle, id: String, move_to_default: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    delete_group_inner(&mut cfg, &id, move_to_default)?;
    config::save(&app, &cfg)?;
    drop(cfg);
    poller::emit_snapshot(&app);
    log::info!(target: "USER", "删除自选股分组 {id} (move_to_default: {move_to_default})");
    Ok(())
}

#[tauri::command]
pub fn set_active_watch_group(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(ref gid) = id {
        if gid != ALL_GROUP_ID && !cfg.groups.iter().any(|g| g.id == *gid) {
            return Err(format!("未找到 ID 为「{gid}」的分组"));
        }
    }
    cfg.active_group_id = id.filter(|g| g != ALL_GROUP_ID);
    config::save(&app, &cfg)?;
    drop(cfg);
    poller::emit_snapshot(&app);
    Ok(())
}

#[tauri::command]
pub fn move_watch_item(app: AppHandle, code: String, target_group: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    move_item_inner(&mut cfg, &code, &target_group)?;
    config::save(&app, &cfg)?;
    drop(cfg);
    poller::emit_snapshot(&app);
    log::info!(target: "USER", "移动股票 {code} 至分组 {target_group}");
    Ok(())
}

#[tauri::command]
pub fn pin_watch_item(app: AppHandle, code: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    pin_item_inner(&mut cfg, &code)?;
    config::save(&app, &cfg)?;
    drop(cfg);
    poller::emit_snapshot(&app);
    log::info!(target: "USER", "置顶自选股票 {code}");
    Ok(())
}

#[tauri::command]
pub fn remove_watch_item(app: AppHandle, code: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    remove_item_inner(&mut cfg, &code)?;
    config::save(&app, &cfg)?;
    drop(cfg);
    poller::emit_snapshot(&app);
    log::info!(target: "USER", "从自选中移除股票 {code}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WatchItem;

    #[test]
    fn test_group_crud_and_item_movement() {
        let mut cfg = Config::default();
        assert_eq!(cfg.groups.len(), 1);
        assert_eq!(cfg.groups[0].id, DEFAULT_GROUP_ID);

        // Add new group
        let g2 = add_group_inner(&mut cfg, "科技股").unwrap();
        assert_eq!(cfg.groups.len(), 2);
        assert_eq!(g2.name, "科技股");

        // Duplicate fails
        assert!(add_group_inner(&mut cfg, "科技股").is_err());
        assert!(add_group_inner(&mut cfg, "  ").is_err());

        // Rename group
        rename_group_inner(&mut cfg, &g2.id, "科技创新").unwrap();
        assert_eq!(cfg.groups.iter().find(|g| g.id == g2.id).unwrap().name, "科技创新");

        // Move item to new group
        let code = cfg.watchlist[0].code.clone();
        move_item_inner(&mut cfg, &code, &g2.id).unwrap();
        assert_eq!(cfg.watchlist[0].group.as_deref(), Some(g2.id.as_str()));

        // Pin item
        let last_code = cfg.watchlist.last().unwrap().code.clone();
        pin_item_inner(&mut cfg, &last_code).unwrap();
        assert_eq!(cfg.watchlist[0].code, last_code);

        // Delete group with move_to_default = true
        delete_group_inner(&mut cfg, &g2.id, true).unwrap();
        assert_eq!(cfg.groups.len(), 1);
        assert_eq!(cfg.watchlist.iter().find(|w| w.code == code).unwrap().group.as_deref(), Some(DEFAULT_GROUP_ID));

        // Delete default group fails
        assert!(delete_group_inner(&mut cfg, DEFAULT_GROUP_ID, true).is_err());
    }

    #[test]
    fn test_delete_group_without_move_to_default_removes_stocks() {
        let mut cfg = Config::default();
        let g = add_group_inner(&mut cfg, "待删分组").unwrap();
        let code = "sz002428";
        let mut item = WatchItem::new(code);
        item.group = Some(g.id.clone());
        cfg.watchlist.push(item);

        assert!(cfg.watchlist.iter().any(|w| w.code == code));
        delete_group_inner(&mut cfg, &g.id, false).unwrap();
        assert!(!cfg.watchlist.iter().any(|w| w.code == code));
    }
}
