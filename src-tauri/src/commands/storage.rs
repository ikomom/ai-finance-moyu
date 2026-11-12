//! Tauri commands for storage stats, cache clearing, directory migration and historical trend.

use tauri::AppHandle;

use crate::history_trend;
use crate::quote::types::DayTrend;
use crate::storage::{self, MigrateResult, StorageStats};

#[tauri::command]
pub async fn get_storage_stats(app: AppHandle) -> Result<StorageStats, String> {
    Ok(storage::get_storage_stats(&app))
}

#[tauri::command]
pub async fn clear_cache(app: AppHandle, category: String) -> Result<(), String> {
    storage::clear_cache(&app, &category)
}

#[tauri::command]
pub async fn migrate_data_dir(app: AppHandle, target: String) -> Result<MigrateResult, String> {
    storage::migrate_data_dir(&app, &target)
}

#[tauri::command]
pub async fn open_data_folder(app: AppHandle) -> Result<(), String> {
    storage::open_data_folder(&app)
}

#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, String> {
    storage::select_folder()
}

#[tauri::command]
pub async fn get_available_history_dates(app: AppHandle, code: String) -> Result<Vec<String>, String> {
    let norm = crate::market::normalize_code(&code)?;
    Ok(history_trend::get_available_dates(&app, &norm))
}

#[tauri::command]
pub async fn get_historical_day_trend(
    app: AppHandle,
    code: String,
    date: String,
) -> Result<Option<DayTrend>, String> {
    let norm = crate::market::normalize_code(&code)?;
    Ok(history_trend::get_day_trend(&app, &norm, &date))
}
