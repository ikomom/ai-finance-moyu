//! IPC commands for Jev / Laya (System-1) AI Decision Engine.

pub mod caller;
pub mod downloader;
pub mod process;
pub mod types;

pub use types::*;

use tauri::{AppHandle, State};
use crate::state::AppState;

#[tauri::command]
pub fn get_ai_decision_config(state: State<'_, AppState>) -> Result<AiDecisionConfig, String> {
    let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
    let mut cfg = guard.ai_decision.clone();
    // Do not leak secret key in plain text if masked
    if cfg.online_api_key.is_some() {
        cfg.online_api_key = Some("".into());
    }
    Ok(cfg)
}

#[tauri::command]
pub fn save_ai_decision_config(
    app: AppHandle,
    state: State<'_, AppState>,
    mut new_cfg: AiDecisionConfig,
) -> Result<(), String> {
    let mut guard = state.config.lock().unwrap_or_else(|e| e.into_inner());

    // Preserve existing online API key if new one is blank
    if let Some(ref key) = new_cfg.online_api_key {
        if key.trim().is_empty() {
            new_cfg.online_api_key = guard.ai_decision.online_api_key.clone();
        }
    } else {
        new_cfg.online_api_key = guard.ai_decision.online_api_key.clone();
    }

    // Mutual exclusion: if switched to online or disabled, stop local process & release port
    match new_cfg.mode {
        AiDecisionMode::Online => {
            let _ = process::stop_service();
            log::info!(
                target: "AI",
                "切换决策模式: 线上模型服务 (端点: {:?})，本地服务已互斥停止并释放端口",
                new_cfg.online_endpoint
            );
        }
        AiDecisionMode::Disabled => {
            let _ = process::stop_service();
            log::info!(target: "AI", "切换决策模式: 已关闭 (Disabled)");
        }
        AiDecisionMode::Local => {
            log::info!(
                target: "AI",
                "切换决策模式: 本地模型服务 (绑定端口: {})，线上服务已互斥停用",
                new_cfg.local_port
            );
        }
    }

    guard.ai_decision = new_cfg;

    // Save to disk
    let _ = crate::config::save(&app, &guard);

    Ok(())
}

#[tauri::command]
pub async fn start_local_decision_service(
    app: AppHandle,
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<LocalServiceStatus, String> {
    let (cfg_port, custom_script, models_dir_cfg) = {
        let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        (
            port.unwrap_or(guard.ai_decision.local_port),
            guard.ai_decision.local_script_path.clone(),
            guard.ai_decision.models_dir.clone(),
        )
    };

    let target_dir = downloader::resolve_models_dir(&app, models_dir_cfg.as_deref());
    let status = process::start_service(cfg_port, custom_script, target_dir).await?;

    if status.running {
        let mut guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        guard.ai_decision.local_port = cfg_port;
        guard.ai_decision.mode = AiDecisionMode::Local;
        let _ = crate::config::save(&app, &guard);
    }

    Ok(status)
}

#[tauri::command]
pub fn stop_local_decision_service() -> Result<LocalServiceStatus, String> {
    Ok(process::stop_service())
}

#[tauri::command]
pub async fn get_local_service_status(
    state: State<'_, AppState>,
    port: Option<u16>,
) -> Result<LocalServiceStatus, String> {
    let check_port = port.unwrap_or_else(|| {
        state
            .config
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .ai_decision
            .local_port
    });

    let running = process::check_service_alive(check_port).await;
    Ok(LocalServiceStatus {
        running,
        port: check_port,
        pid: None,
        message: if running {
            format!("端口 {check_port} 正常监听响应")
        } else {
            "未检测到服务监听".into()
        },
    })
}

#[tauri::command]
pub async fn download_decision_model(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> Result<String, String> {
    let (target_model, models_dir_cfg) = {
        let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        (
            model_id.unwrap_or_else(|| guard.ai_decision.local_model_id.clone()),
            guard.ai_decision.models_dir.clone(),
        )
    };

    let base_dir = downloader::resolve_models_dir(&app, models_dir_cfg.as_deref());
    let target_dir = base_dir.join(&target_model);

    downloader::download_model_files(app, target_model, target_dir).await
}

#[tauri::command]
pub fn cancel_download_decision_model() -> bool {
    downloader::cancel_current_download()
}

#[tauri::command]
pub fn open_models_dir(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let models_dir_cfg = {
        let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        guard.ai_decision.models_dir.clone()
    };
    downloader::open_models_directory(&app, models_dir_cfg.as_deref())
}

#[tauri::command]
pub fn get_model_download_status(
    app: AppHandle,
    state: State<'_, AppState>,
    model_id: Option<String>,
) -> bool {
    let (target_model, models_dir_cfg) = {
        let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        (
            model_id.unwrap_or_else(|| guard.ai_decision.local_model_id.clone()),
            guard.ai_decision.models_dir.clone(),
        )
    };
    let base_dir = downloader::resolve_models_dir(&app, models_dir_cfg.as_deref());
    let target_dir = base_dir.join(&target_model);
    downloader::check_model_downloaded(&target_dir)
}

#[tauri::command]
pub async fn decide_stock_with_ai(
    state: State<'_, AppState>,
    payload: StockDecisionPayload,
) -> Result<StockDecisionResult, String> {
    let cfg = {
        let guard = state.config.lock().unwrap_or_else(|e| e.into_inner());
        guard.ai_decision.clone()
    };
    caller::execute_decision(&cfg, payload).await
}
