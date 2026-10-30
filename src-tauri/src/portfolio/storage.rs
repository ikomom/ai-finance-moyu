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
    match serde_json::from_str::<PortfolioData>(&text) {
        Ok(data) => data,
        Err(e) => {
            log::error!(target: "SYSTEM", "portfolio.json 解析失败({e})，已备份为 portfolio.json.bak 并回退默认");
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
