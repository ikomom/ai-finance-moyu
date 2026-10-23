//! Model downloader with domestic acceleration (ModelScope + HF-Mirror),
//! HTTP Range resumable transfers, throttled IPC progress, and cancel tokens.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use reqwest::header::RANGE;
use reqwest::{Client, StatusCode};
use tauri::{AppHandle, Emitter};

use super::types::ModelDownloadProgress;

static CANCEL_DOWNLOAD: std::sync::Mutex<Option<Arc<AtomicBool>>> = std::sync::Mutex::new(None);

pub fn cancel_current_download() -> bool {
    let mut guard = CANCEL_DOWNLOAD.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(token) = guard.take() {
        token.store(true, Ordering::SeqCst);
        log::warn!(target: "AI", "已触发模型下载取消令牌");
        true
    } else {
        false
    }
}

pub fn resolve_models_dir(app: &AppHandle, configured_dir: Option<&str>) -> PathBuf {
    if let Some(dir) = configured_dir {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|d| d.join("models"))
        .unwrap_or_else(|_| PathBuf::from("models"))
}

pub fn open_models_directory(app: &AppHandle, configured_dir: Option<&str>) -> Result<(), String> {
    let dir = resolve_models_dir(app, configured_dir);
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }

    #[cfg(windows)]
    {
        let path_str = dir.display().to_string();
        std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("打开模型目录失败: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        let path_str = dir.display().to_string();
        std::process::Command::new("open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("打开模型目录失败: {e}"))?;
    }

    Ok(())
}

pub async fn download_model_files(
    app: AppHandle,
    model_id: String,
    target_dir: PathBuf,
) -> Result<String, String> {
    let cancel_token = Arc::new(AtomicBool::new(false));
    {
        let mut guard = CANCEL_DOWNLOAD.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(cancel_token.clone());
    }

    log::info!(target: "AI", "开始加速下载模型: {} -> 目标: {}", model_id, target_dir.display());

    if let Err(e) = fs::create_dir_all(&target_dir) {
        let msg = format!("创建模型存储目录失败: {e}");
        log::error!(target: "AI", "{msg}");
        return Err(msg);
    }

    // Do NOT configure .no_proxy() so system VPN / domestic routing works seamlessly
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("构造 HTTP 客户端失败: {e}"))?;

    let files = vec!["config.json", "model.safetensors"];
    let start_time = Instant::now();

    for file_name in files {
        if cancel_token.load(Ordering::SeqCst) {
            log::warn!(target: "AI", "用户取消模型下载任务 ({model_id})");
            return Err("下载已由用户取消".into());
        }

        let dest_path = target_dir.join(file_name);
        let temp_path = target_dir.join(format!("{file_name}.part"));

        // If file already exists and is non-empty, skip
        if dest_path.exists() {
            if let Ok(meta) = fs::metadata(&dest_path) {
                if meta.len() > 1024 {
                    log::info!(target: "AI", "文件已完整就绪，跳过: {}", dest_path.display());
                    continue;
                }
            }
        }

        // Multi-source candidate endpoints: ModelScope (Alibaba CDN) first, hf-mirror second
        let candidate_urls = vec![
            format!("https://modelscope.cn/api/v1/models/{model_id}/repo?Revision=master&FilePath={file_name}"),
            format!("https://hf-mirror.com/{model_id}/resolve/main/{file_name}"),
            format!("https://huggingface.co/{model_id}/resolve/main/{file_name}"),
        ];

        let mut existing_len: u64 = 0;
        if temp_path.exists() {
            if let Ok(meta) = fs::metadata(&temp_path) {
                existing_len = meta.len();
                if existing_len > 0 {
                    log::info!(
                        target: "AI",
                        "检测到断点残片 {file_name}: 已就绪 {:.2} MB，尝试 HTTP Range 断点续传",
                        existing_len as f64 / (1024.0 * 1024.0)
                    );
                }
            }
        }

        let mut response_opt = None;
        let mut is_resumed = false;

        for url in &candidate_urls {
            if cancel_token.load(Ordering::SeqCst) {
                return Err("下载已由用户取消".into());
            }

            log::info!(target: "AI", "尝试下载节点: {url}");
            let mut req = client.get(url);
            if existing_len > 0 {
                req = req.header(RANGE, format!("bytes={existing_len}-"));
            }

            if let Ok(res) = req.send().await {
                if res.status() == StatusCode::PARTIAL_CONTENT {
                    is_resumed = true;
                    response_opt = Some(res);
                    break;
                } else if res.status().is_success() {
                    is_resumed = false;
                    response_opt = Some(res);
                    break;
                }
            }
        }

        let mut res = response_opt.ok_or_else(|| {
            format!("所有加速节点连接失败，无法获取 {file_name}，请检查网络连接")
        })?;

        let (mut downloaded, total_size) = if is_resumed && existing_len > 0 {
            (
                existing_len,
                res.content_length().unwrap_or(0) + existing_len,
            )
        } else {
            (0, res.content_length().unwrap_or(0))
        };

        let mut out_file = if is_resumed && existing_len > 0 {
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(&temp_path)
                .map_err(|e| format!("打开续传残片文件失败: {e}"))?
        } else {
            File::create(&temp_path)
                .map_err(|e| format!("创建临时文件失败: {e}"))?
        };

        let mut last_emit = Instant::now();

        while let Some(chunk) = res
            .chunk()
            .await
            .map_err(|e| format!("读取分块失败: {e}"))?
        {
            if cancel_token.load(Ordering::SeqCst) {
                drop(out_file);
                log::warn!(target: "AI", "下载已取消，断点残片保留用于下次续传: {}", temp_path.display());
                return Err("下载已由用户取消".into());
            }

            out_file
                .write_all(&chunk)
                .map_err(|e| format!("写入文件失败: {e}"))?;
            downloaded += chunk.len() as u64;

            // Throttle IPC emission to every 100ms to avoid flooding Tauri event loop
            if last_emit.elapsed() >= std::time::Duration::from_millis(100)
                || (total_size > 0 && downloaded >= total_size)
            {
                let pct = if total_size > 0 {
                    ((downloaded as f64 / total_size as f64) * 100.0).min(100.0)
                } else {
                    0.0
                };

                let _ = app.emit(
                    "ai-model-download-progress",
                    ModelDownloadProgress {
                        model_id: model_id.clone(),
                        status: "downloading".into(),
                        downloaded_bytes: downloaded,
                        total_bytes: total_size,
                        percent: (pct * 10.0).round() / 10.0,
                        message: Some(format!("正在加速下载 {file_name}")),
                    },
                );
                last_emit = Instant::now();
            }
        }

        drop(out_file);
        if let Err(e) = fs::rename(&temp_path, &dest_path) {
            let msg = format!("重命名就绪文件失败: {e}");
            log::error!(target: "AI", "{msg}");
            return Err(msg);
        }
    }

    let elapsed = start_time.elapsed().as_secs_f64();
    log::info!(target: "AI", "模型权重全部加速就绪: {} (耗时 {:.1} 秒)", model_id, elapsed);

    let _ = app.emit(
        "ai-model-download-progress",
        ModelDownloadProgress {
            model_id: model_id.clone(),
            status: "completed".into(),
            downloaded_bytes: 0,
            total_bytes: 0,
            percent: 100.0,
            message: Some("模型已成功就绪".into()),
        },
    );

    Ok("模型下载完成并已就绪".into())
}

pub fn check_model_downloaded(target_dir: &Path) -> bool {
    let weight = target_dir.join("model.safetensors");
    let cfg = target_dir.join("config.json");
    weight.exists() && cfg.exists()
}
