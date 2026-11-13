//! Storage and cache directory management, usage statistics, and atomic data migration.

use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub data_dir: String,
    pub is_custom_dir: bool,
    pub total_size_bytes: u64,
    pub history_trend_size_bytes: u64,
    pub history_trend_day_count: usize,
    pub kline_cache_size_bytes: u64,
    pub baseline_cache_size_bytes: u64,
    pub logs_size_bytes: u64,
    pub ai_models_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub success: bool,
    pub file_count: usize,
    pub total_bytes: u64,
    pub new_dir: String,
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

/// Calculate current storage statistics across all cached categories.
pub fn get_storage_stats(app: &AppHandle) -> StorageStats {
    let conf_dir = crate::config::config_dir(app).unwrap_or_default();
    let default_conf = crate::config::default_config_dir(app).unwrap_or_default();
    let is_custom_dir = conf_dir != default_conf;

    let (history_trend_size_bytes, history_trend_day_count) =
        crate::history_trend::get_history_stats(app);

    let baseline_cache_size_bytes = conf_dir
        .join("cache.json")
        .metadata()
        .map(|m| m.len())
        .unwrap_or(0);

    let log_path = crate::logger::log_dir(app).unwrap_or_else(|_| conf_dir.join("logs"));
    let logs_size_bytes = if log_path.exists() { dir_size(&log_path) } else { 0 };

    let models_dir = conf_dir.join("models");
    let ai_models_size_bytes = if models_dir.exists() { dir_size(&models_dir) } else { 0 };

    let total_size_bytes = if conf_dir.exists() { dir_size(&conf_dir) } else { 0 };

    StorageStats {
        data_dir: conf_dir.to_string_lossy().to_string(),
        is_custom_dir,
        total_size_bytes,
        history_trend_size_bytes,
        history_trend_day_count,
        kline_cache_size_bytes: 0,
        baseline_cache_size_bytes,
        logs_size_bytes,
        ai_models_size_bytes,
    }
}

/// Clear a specific cache category without deleting core config or portfolio.
pub fn clear_cache(app: &AppHandle, category: &str) -> Result<(), String> {
    let conf_dir = crate::config::config_dir(app)?;

    match category {
        "history_trend" => {
            crate::history_trend::clear_history(app)?;
        }
        "ai_models" => {
            let m = conf_dir.join("models");
            if m.exists() {
                let _ = fs::remove_dir_all(m);
            }
        }
        "baseline" => {
            let p = conf_dir.join("cache.json");
            if p.exists() {
                let _ = fs::remove_file(p);
            }
        }
        "logs" => {
            let log_dir = crate::logger::log_dir(app)?;
            if log_dir.exists() {
                if let Ok(entries) = fs::read_dir(&log_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if name.starts_with("app.") && name.ends_with(".log") && name != "app.log" {
                            let _ = fs::remove_file(path);
                        }
                    }
                }
            }
        }
        "all_cache" => {
            let _ = crate::history_trend::clear_history(app);
            let p = conf_dir.join("cache.json");
            if p.exists() {
                let _ = fs::remove_file(p);
            }
            if let Ok(log_dir) = crate::logger::log_dir(app) {
                if log_dir.exists() {
                    if let Ok(entries) = fs::read_dir(&log_dir) {
                        for entry in entries.flatten() {
                            let path = entry.path();
                            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if name.starts_with("app.") && name.ends_with(".log") && name != "app.log" {
                                let _ = fs::remove_file(path);
                            }
                        }
                    }
                }
            }
        }
        _ => return Err(format!("未知的缓存类别: {category}")),
    }

    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path, count: &mut usize, bytes: &mut u64) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dst_path, count, bytes)?;
        } else {
            *bytes += entry.metadata()?.len();
            *count += 1;
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// Atomically migrate the entire application data directory to a user-chosen target path.
pub fn migrate_data_dir(app: &AppHandle, target_dir_str: &str) -> Result<MigrateResult, String> {
    let trimmed = target_dir_str.trim();
    if trimmed.is_empty() {
        return Err("目标目录路径不能为空".into());
    }

    let target = PathBuf::from(trimmed);
    let current = crate::config::config_dir(app)?;
    let default_conf = crate::config::default_config_dir(app)?;

    if target == current {
        return Err("目标路径与当前数据目录相同，无需迁移".into());
    }

    if target.starts_with(&current) {
        return Err("目标路径不能位于当前数据目录的子目录内，以防止循环递归复制".into());
    }

    // Attempt to create target dir if not exists
    if !target.exists() {
        fs::create_dir_all(&target)
            .map_err(|e| format!("无法创建目标目录 {:?}: {e}", target))?;
    }

    let mut file_count = 0;
    let mut total_bytes = 0;

    // 1. Copy all existing files from current to target
    if current.exists() {
        copy_dir_all(&current, &target, &mut file_count, &mut total_bytes)
            .map_err(|e| format!("复制文件到目标目录失败: {e}"))?;
    }

    // 2. Write pointer file in default AppData
    let pointer_file = default_conf.join("data_dir_pointer.txt");
    if target == default_conf {
        // Resetting to default: remove pointer
        if pointer_file.exists() {
            let _ = fs::remove_file(pointer_file);
        }
    } else {
        if let Some(parent) = pointer_file.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&pointer_file, target.to_string_lossy().as_bytes())
            .map_err(|e| format!("写入数据目录引导指针失败: {e}"))?;
    }

    crate::logger::update_log_dir(&target.join("logs"));

    log::info!(
        target: "SYSTEM",
        "全局数据目录迁移完成: {:?} -> {:?} (共 {} 文件, {} 字节)",
        current, target, file_count, total_bytes
    );

    Ok(MigrateResult {
        success: true,
        file_count,
        total_bytes,
        new_dir: target.to_string_lossy().to_string(),
    })
}

/// Open the active data directory in Windows Explorer.
pub fn open_data_folder(app: &AppHandle) -> Result<(), String> {
    let dir = crate::config::config_dir(app)?;
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {e}"))?;
    }
    Ok(())
}

/// Open native folder picker dialog via PowerShell COM Object.
pub fn select_folder() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = std::process::Command::new("powershell");
        cmd.creation_flags(0x08000000);
        let output = cmd
            .args([
                "-NoProfile",
                "-Command",
                "$app = New-Object -ComObject Shell.Application; $folder = $app.BrowseForFolder(0, '请选择数据存储目录', 0, 0); if ($folder) { $folder.Self.Path }",
            ])
            .output()
            .map_err(|e| format!("无法唤起文件夹选择框: {e}"))?;

        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Ok(Some(path_str));
            }
        }
    }
    Ok(None)
}
