//! Window operations, context menu, docking, and URL opening IPC commands.

use tauri::{AppHandle, Manager};

use crate::config::VisibilityMode;
use crate::tray;
use crate::window::{apply_visibility_mode, open_settings, set_dock_collapsed_inner, DISPLAY};

#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings(&app)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn set_dock_collapsed(app: AppHandle, collapsed: bool) -> Result<(), String> {
    set_dock_collapsed_inner(&app, collapsed)
}

#[tauri::command]
pub fn set_visibility_mode(app: AppHandle, mode: VisibilityMode) -> Result<(), String> {
    apply_visibility_mode(&app, mode)
}

#[tauri::command]
pub fn show_context_menu(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(DISPLAY) {
        tray::show_context_menu(&app, &win).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgressPayload {
    pub downloaded: u64,
    pub total: u64,
    pub pct: u32,
}

#[tauri::command]
pub async fn download_and_install_package(
    app: AppHandle,
    url: String,
    filename: String,
) -> Result<(), String> {
    use std::io::Write;
    use tauri::Emitter;

    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    // Try primary URL, fallback to mirror if GitHub direct fails
    let mut target_url = url.clone();
    let mut resp = client.get(&target_url).send().await;

    if resp.is_err() || !resp.as_ref().unwrap().status().is_success() {
        if target_url.contains("github.com") {
            let mirror_url = format!("https://ghproxy.net/{}", target_url);
            if let Ok(mirror_resp) = client.get(&mirror_url).send().await {
                if mirror_resp.status().is_success() {
                    resp = Ok(mirror_resp);
                    target_url = mirror_url;
                }
            }
        }
    }

    let mut response = resp.map_err(|e| format!("下载安装包失败: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("下载服务器返回异常状态: {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let dest_path = std::env::temp_dir().join(&filename);
    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("创建临时安装包文件失败: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("读取下载分块错误: {e}"))?
    {
        file.write_all(&chunk)
            .map_err(|e| format!("写入文件失败: {e}"))?;
        downloaded += chunk.len() as u64;

        if last_emit.elapsed() >= std::time::Duration::from_millis(80)
            || (total > 0 && downloaded >= total)
        {
            let pct = if total > 0 {
                ((downloaded as f64 / total as f64) * 100.0).min(100.0) as u32
            } else {
                0
            };
            let _ = app.emit(
                "installer-download-progress",
                DownloadProgressPayload {
                    downloaded,
                    total,
                    pct,
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    drop(file);

    // Final 100% progress
    let _ = app.emit(
        "installer-download-progress",
        DownloadProgressPayload {
            downloaded: if total > 0 { total } else { downloaded },
            total: if total > 0 { total } else { downloaded },
            pct: 100,
        },
    );

    // Launch downloaded installer
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&dest_path)
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {e}"))?;
        app.exit(0);
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dest_path)
            .spawn()
            .map_err(|e| format!("打开安装包失败: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dest_path)
            .spawn()
            .map_err(|e| format!("打开安装包失败: {e}"))?;
    }

    Ok(())
}

