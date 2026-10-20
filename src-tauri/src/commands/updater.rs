//! Updater / installer delivery commands.
//!
//! Split out of `window.rs` to keep each command module inside the 300-line
//! budget (AGENTS.md §11). Everything here is about fetching release metadata
//! and delivering a signed installer; nothing here is window manipulation.

use tauri::AppHandle;

use std::sync::atomic::{AtomicBool, Ordering};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct GitHubReleaseInfo {
    pub tag_name: String,
    pub published_at: Option<String>,
    pub body: Option<String>,
    #[serde(default)]
    pub assets: Vec<ReleaseAsset>,
}

#[tauri::command]
pub async fn fetch_latest_release() -> Result<GitHubReleaseInfo, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("创建网络客户端失败: {e}"))?;

    let direct_url = "https://api.github.com/repos/ikomom/ai-finance-moyu/releases/latest";
    let resp = client
        .get(direct_url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "ai-finance-moyu")
        .send()
        .await;

    let response = match resp {
        Ok(r) if r.status().is_success() => r,
        _ => {
            let mirror_url = "https://ghproxy.net/https://api.github.com/repos/ikomom/ai-finance-moyu/releases/latest";
            client
                .get(mirror_url)
                .header("Accept", "application/vnd.github.v3+json")
                .header("User-Agent", "ai-finance-moyu")
                .send()
                .await
                .map_err(|e| format!("请求 GitHub Release 失败: {e}"))?
        }
    };

    if !response.status().is_success() {
        return Err(format!("Release API 返回状态: {}", response.status()));
    }

    let text = response.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
    serde_json::from_str::<GitHubReleaseInfo>(&text).map_err(|e| format!("解析 Release 信息失败: {e}"))
}

static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn cancel_package_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgressPayload {
    pub downloaded: u64,
    pub total: u64,
    pub pct: u32,
}

/// Hosts the installer may be downloaded from: GitHub itself and the two
/// mirrors this app documents. The URL ultimately comes from the Release API,
/// but validating it here means a compromised or spoofed release entry cannot
/// point the downloader at an arbitrary server.
const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &[
    "github.com",
    "objects.githubusercontent.com",
    "ghfast.top",
    "gh-proxy.com",
    "ghproxy.net",
];

const ALLOWED_INSTALLER_EXTENSIONS: &[&str] = &["exe", "msi", "dmg", "appimage"];

/// Reject anything that is not an https URL on an allow-listed host.
fn validate_download_url(raw: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|e| format!("非法下载地址: {e}"))?;
    if parsed.scheme() != "https" {
        return Err(format!("安装包必须通过 HTTPS 下载（当前: {}）", parsed.scheme()));
    }
    let host = parsed.host_str().unwrap_or_default();
    if !ALLOWED_DOWNLOAD_HOSTS.contains(&host) {
        return Err(format!("不允许的下载来源: {host}"));
    }
    Ok(parsed)
}

/// Reduce a caller-supplied name to a bare file name with an installer extension.
///
/// `Path::file_name()` drops every directory component, so `..\..\Startup\x.exe`
/// becomes `x.exe` inside `%TEMP%` instead of escaping it.
fn sanitize_installer_filename(raw: &str) -> Result<String, String> {
    let name = std::path::Path::new(raw)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "非法的安装包文件名".to_string())?;
    let extension = std::path::Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !ALLOWED_INSTALLER_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("不允许的安装包类型: .{extension}"));
    }
    Ok(name.to_string())
}

#[tauri::command]
pub async fn download_and_install_package(
    app: AppHandle,
    url: String,
    filename: String,
) -> Result<(), String> {
    use std::io::Write;
    use tauri::Emitter;

    let validated = validate_download_url(&url)?;
    let safe_name = sanitize_installer_filename(&filename)?;

    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    // Try accelerated GitHub proxy mirrors first, fallback to direct URL
    let base = validated.to_string();
    let mut candidate_urls = Vec::new();
    if base.contains("github.com") {
        candidate_urls.push(format!("https://ghfast.top/{base}"));
        candidate_urls.push(format!("https://gh-proxy.com/{base}"));
    }
    candidate_urls.push(base);

    let mut response_opt = None;
    for target in candidate_urls {
        if CANCEL_DOWNLOAD.load(Ordering::SeqCst) {
            return Err("下载已取消".to_string());
        }
        if let Ok(resp) = client.get(&target).send().await {
            if resp.status().is_success() {
                response_opt = Some(resp);
                break;
            }
        }
    }

    let mut response = response_opt.ok_or_else(|| "下载服务器连接失败，请检查网络".to_string())?;

    let total = response.content_length().unwrap_or(0);
    let dest_path = std::env::temp_dir().join(&safe_name);
    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("创建临时安装包文件失败: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("读取下载分块错误: {e}"))?
    {
        if CANCEL_DOWNLOAD.load(Ordering::SeqCst) {
            drop(file);
            let _ = std::fs::remove_file(&dest_path);
            return Err("下载已取消".to_string());
        }

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

    if CANCEL_DOWNLOAD.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(&dest_path);
        return Err("下载已取消".to_string());
    }

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

