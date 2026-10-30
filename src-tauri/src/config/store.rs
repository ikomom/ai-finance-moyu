//! Loading, saving and caching of the config file.
//!
//! Every write goes through a temp file + rename so a crash mid-write cannot
//! leave a truncated config behind.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::quote::{Quote, Trend};

use super::types::*;

pub fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录: {e}"))
}

pub fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("config.json"))
}

/// Load from disk, falling back to defaults. A corrupt file is moved aside
/// rather than deleted, so the user can recover a hand-edited config.
pub fn load(app: &AppHandle) -> Config {
    let Ok(path) = config_path(app) else {
        return Config::default();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return Config::default();
    };

    let raw_val: Result<serde_json::Value, _> = serde_json::from_str(&text);
    match raw_val {
        Ok(val) => {
            let (migrated_val, was_migrated) = super::migrate::migrate_config_value(val);
            if was_migrated {
                let bak_name = format!("config.pre_v{}.bak.json", super::types::CONFIG_SCHEMA_VERSION);
                let bak_path = path.with_file_name(bak_name);
                let _ = std::fs::write(&bak_path, &text);
                log::info!(
                    target: "SYSTEM",
                    "检测到旧版配置，已创建原文件安全快照 {:?} 并无损升级至 schema v{}",
                    bak_path.file_name().unwrap_or_default(),
                    super::types::CONFIG_SCHEMA_VERSION
                );
            }

            match serde_json::from_value::<Config>(migrated_val) {
                Ok(mut cfg) => {
                    cfg.sanitize();
                    if was_migrated {
                        let _ = save(app, &cfg);
                    }
                    cfg
                }
                Err(e) => {
                    log::error!(target: "SYSTEM", "config.json 结构反序列化失败({e})，已备份为 config.json.bak 并回退默认配置");
                    let _ = std::fs::rename(&path, path.with_extension("json.bak"));
                    Config::default()
                }
            }
        }
        Err(e) => {
            log::error!(target: "SYSTEM", "config.json 语法损坏({e})，已备份为 config.json.bak 并回退默认配置");
            let _ = std::fs::rename(&path, path.with_extension("json.bak"));
            Config::default()
        }
    }
}

/// Atomic save: write a sibling temp file, then rename over the target.
/// `std::fs::rename` replaces an existing file on Windows (MOVEFILE_REPLACE_EXISTING).
pub fn save(app: &AppHandle, cfg: &Config) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| format!("序列化失败: {e}"))?;

    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("写入临时配置失败: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("替换配置文件失败: {e}"))?;
    Ok(())
}

/// Local cache of quotes and trends saved to disk, so opening the app
/// offline or outside market hours still instantly displays the last known data.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QuotesCache {
    pub quotes: Vec<Quote>,
    pub trends: HashMap<String, Trend>,
    #[serde(default)]
    pub auctions: HashMap<String, crate::auction_engine::AuctionData>,
}

pub fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("cache.json"))
}

pub fn load_cache(app: &AppHandle) -> QuotesCache {
    let Ok(path) = cache_path(app) else {
        return QuotesCache::default();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return QuotesCache::default();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

/// Minimum spacing between cache writes.
///
/// The poll loop refreshes quotes every ~3 s during trading hours; writing a
/// fresh JSON file on every tick meant ~10k synchronous disk writes a day, all
/// of them while holding the quote/config locks. One minute of staleness on a
/// file whose only job is "show something before the first network reply" costs
/// nothing.
const CACHE_SAVE_INTERVAL: std::time::Duration = std::time::Duration::from_secs(60);

static LAST_CACHE_SAVE: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);

/// Persist quotes/trends, rate-limited to one write per [`CACHE_SAVE_INTERVAL`].
///
/// Callers should already have released their state locks: this does blocking
/// file I/O and must never run while a `quotes`/`config` guard is held.
pub fn save_cache(app: &AppHandle, cache: &QuotesCache) {
    {
        let mut last = LAST_CACHE_SAVE.lock().unwrap_or_else(|e| e.into_inner());
        let now = std::time::Instant::now();
        if last.is_some_and(|t| now.duration_since(t) < CACHE_SAVE_INTERVAL) {
            return;
        }
        *last = Some(now);
    }

    if let Ok(path) = cache_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string(cache) {
            let tmp = path.with_extension("json.tmp");
            if std::fs::write(&tmp, json).is_ok() {
                let _ = std::fs::rename(&tmp, &path);
            }
        }
    }
}
