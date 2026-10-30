//! Atomic loading and saving of the independent `portfolio.json` ledger file.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::types::PortfolioData;

pub fn portfolio_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map_err(|e| format!("无法定位配置目录: {e}"))
}

pub fn portfolio_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(portfolio_dir(app)?.join("portfolio.json"))
}

/// Load portfolio ledger from disk, falling back to defaults on missing/corrupt file.
pub fn load(app: &AppHandle) -> PortfolioData {
    let Ok(path) = portfolio_path(app) else {
        return PortfolioData::default();
    };
    let Ok(text) = std::fs::read_to_string(&path) else {
        return PortfolioData::default();
    };

    let raw_val: Result<serde_json::Value, _> = serde_json::from_str(&text);
    match raw_val {
        Ok(val) => {
            let (migrated_val, was_migrated) = super::migrate::migrate_portfolio_value(val);
            if was_migrated {
                let bak_name = format!("portfolio.pre_v{}.bak.json", super::types::PORTFOLIO_SCHEMA_VERSION);
                let bak_path = path.with_file_name(bak_name);
                let _ = std::fs::write(&bak_path, &text);
                log::info!(
                    target: "SYSTEM",
                    "检测到旧版账本，已创建原文件安全快照 {:?} 并无损升级至 schema v{}",
                    bak_path.file_name().unwrap_or_default(),
                    super::types::PORTFOLIO_SCHEMA_VERSION
                );
            }

            match serde_json::from_value::<PortfolioData>(migrated_val) {
                Ok(data) => {
                    if was_migrated {
                        let _ = save(app, &data);
                    }
                    data
                }
                Err(e) => {
                    log::error!(target: "SYSTEM", "portfolio.json 结构反序列化失败({e})，已备份为 portfolio.json.bak 并回退默认");
                    let _ = std::fs::rename(&path, path.with_extension("json.bak"));
                    PortfolioData::default()
                }
            }
        }
        Err(e) => {
            log::error!(target: "SYSTEM", "portfolio.json 语法损坏({e})，已备份为 portfolio.json.bak 并回退默认");
            let _ = std::fs::rename(&path, path.with_extension("json.bak"));
            PortfolioData::default()
        }
    }
}

/// Atomic save of the portfolio ledger.
pub fn save(app: &AppHandle, data: &PortfolioData) -> Result<(), String> {
    let path = portfolio_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(data).map_err(|e| format!("序列化账本失败: {e}"))?;

    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("写入临时账本失败: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("替换账本文件失败: {e}"))?;
    Ok(())
}
