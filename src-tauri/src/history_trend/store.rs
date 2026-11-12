//! Persistent storage for multi-year historical intraday trends.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use super::types::*;
use crate::quote::types::DayTrend;

pub fn history_trend_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::config::config_dir(app)?.join("history_trend"))
}

pub fn security_dir(app: &AppHandle, code: &str) -> Result<PathBuf, String> {
    Ok(history_trend_root(app)?.join(code.to_lowercase()))
}

fn parse_year_and_key(date_str: &str) -> Option<(i32, String)> {
    let clean = date_str.replace('-', "");
    if clean.len() < 8 {
        return None;
    }
    let year: i32 = clean[..4].parse().ok()?;
    let key = clean[..8].to_string();
    Some((year, key))
}

fn load_year_archive(path: &Path, code: &str, year: i32) -> YearArchive {
    if let Ok(text) = fs::read_to_string(path) {
        if let Ok(archive) = serde_json::from_str::<YearArchive>(&text) {
            return archive;
        }
    }
    YearArchive::new(code.to_string(), year)
}

fn save_year_archive_atomic(path: &Path, archive: &YearArchive) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string(archive)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, path)
}

/// Archive a batch of daily trends for a security, upgrading partial records atomically.
pub fn archive_days(app: &AppHandle, code: &str, days: &[DayTrend]) {
    let Ok(sec_dir) = security_dir(app, code) else { return };
    let mut year_groups: std::collections::HashMap<i32, Vec<(String, StoredDayTrend)>> =
        std::collections::HashMap::new();

    for d in days {
        if d.points.is_empty() {
            continue;
        }
        if let Some((year, key)) = parse_year_and_key(&d.date) {
            let stored = day_trend_to_stored(d);
            year_groups.entry(year).or_default().push((key, stored));
        }
    }

    for (year, items) in year_groups {
        let year_file = sec_dir.join(format!("{year}.json"));
        let mut archive = load_year_archive(&year_file, code, year);
        let mut modified = false;

        for (key, new_stored) in items {
            if let Some(existing) = archive.days.get(&key) {
                // If existing is already full session and new is partial, do not overwrite
                if existing.complete && !new_stored.complete && new_stored.point_count < existing.point_count {
                    continue;
                }
                // If point count is identical and complete status is same, skip
                if existing.point_count == new_stored.point_count && existing.complete == new_stored.complete {
                    continue;
                }
            }
            archive.days.insert(key, new_stored);
            modified = true;
        }

        if modified {
            archive.updated_at = chrono::Local::now().to_rfc3339();
            let _ = save_year_archive_atomic(&year_file, &archive);
        }
    }
}

/// Retrieve all available historical dates for a security in chronological order (YYYY-MM-DD).
pub fn get_available_dates(app: &AppHandle, code: &str) -> Vec<String> {
    let Ok(sec_dir) = security_dir(app, code) else { return Vec::new() };
    if !sec_dir.exists() {
        return Vec::new();
    }

    let Ok(entries) = fs::read_dir(&sec_dir) else { return Vec::new() };
    let mut all_dates = BTreeSet::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            if let Ok(text) = fs::read_to_string(&path) {
                if let Ok(archive) = serde_json::from_str::<YearArchive>(&text) {
                    for key in archive.days.keys() {
                        if key.len() == 8 {
                            let formatted = format!("{}-{}-{}", &key[..4], &key[4..6], &key[6..8]);
                            all_dates.insert(formatted);
                        } else {
                            all_dates.insert(key.clone());
                        }
                    }
                }
            }
        }
    }

    all_dates.into_iter().collect()
}

/// Retrieve a single day's historical trend from disk.
pub fn get_day_trend(app: &AppHandle, code: &str, date_str: &str) -> Option<DayTrend> {
    let (year, key) = parse_year_and_key(date_str)?;
    let sec_dir = security_dir(app, code).ok()?;
    let year_file = sec_dir.join(format!("{year}.json"));
    if !year_file.exists() {
        return None;
    }

    let text = fs::read_to_string(&year_file).ok()?;
    let archive = serde_json::from_str::<YearArchive>(&text).ok()?;
    let stored = archive.days.get(&key)?;
    Some(stored_to_day_trend(date_str, stored))
}

/// Get history trend cache stats: (total_bytes, total_days_count).
pub fn get_history_stats(app: &AppHandle) -> (u64, usize) {
    let Ok(root) = history_trend_root(app) else { return (0, 0) };
    if !root.exists() {
        return (0, 0);
    }

    let mut total_bytes = 0u64;
    let mut day_count = 0usize;

    if let Ok(entries) = fs::read_dir(&root) {
        for sec in entries.flatten() {
            if let Ok(sec_entries) = fs::read_dir(sec.path()) {
                for file_entry in sec_entries.flatten() {
                    let path = file_entry.path();
                    if path.extension().is_some_and(|e| e == "json") {
                        if let Ok(meta) = file_entry.metadata() {
                            total_bytes += meta.len();
                        }
                        if let Ok(text) = fs::read_to_string(&path) {
                            if let Ok(archive) = serde_json::from_str::<YearArchive>(&text) {
                                day_count += archive.days.len();
                            }
                        }
                    }
                }
            }
        }
    }

    (total_bytes, day_count)
}

/// Clear all history trend archived files.
pub fn clear_history(app: &AppHandle) -> Result<(), String> {
    let root = history_trend_root(app)?;
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| format!("清理历史分时目录失败: {e}"))?;
    }
    Ok(())
}
