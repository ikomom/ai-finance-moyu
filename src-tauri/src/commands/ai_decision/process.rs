//! Local decision service child process lifecycle manager.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use reqwest::Client;

use super::types::LocalServiceStatus;

static LOCAL_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const EMBEDDED_SCRIPT: &str = include_str!("../../../../scripts/decision_server.py");

pub async fn check_service_alive(port: u16) -> bool {
    let client = match Client::builder().no_proxy().timeout(Duration::from_millis(600)).build() {
        Ok(c) => c,
        Err(_) => return false,
    };
    let url = format!("http://127.0.0.1:{port}/health");
    if let Ok(res) = client.get(&url).send().await {
        return res.status().is_success();
    }
    // Also try root /
    let root_url = format!("http://127.0.0.1:{port}/");
    if let Ok(res) = client.get(&root_url).send().await {
        return res.status().is_success();
    }
    false
}

pub async fn start_service(
    port: u16,
    script_path: Option<String>,
    models_dir: PathBuf,
) -> Result<LocalServiceStatus, String> {
    // 1. If already listening on this port, report active
    if check_service_alive(port).await {
        log::info!(target: "AI", "本地服务已在端口 {} 运行就绪", port);
        let pid = LOCAL_PROCESS
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .map(|c| c.id());
        return Ok(LocalServiceStatus {
            running: true,
            port,
            pid,
            message: format!("服务已在端口 {port} 运行就绪"),
        });
    }

    // Stop existing process if different port was running
    let _ = stop_service();

    // 2. Resolve script and python runner
    let (python_bin, script) = resolve_runner(script_path.as_deref(), &models_dir)?;

    log::info!(
        target: "AI",
        "启动本地决策服务: 解释器={}, 脚本={}, 端口={}, 模型目录={}",
        python_bin,
        script.display(),
        port,
        models_dir.display()
    );

    let mut cmd = Command::new(&python_bin);
    cmd.arg(&script)
        .env("PORT", port.to_string())
        .env("GATEWAY_PORT", port.to_string())
        .env("MODELS_DIR", &models_dir)
        .env("HF_HOME", &models_dir)
        .env("HF_ENDPOINT", "https://hf-mirror.com");

    if let Some(parent) = script.parent() {
        cmd.current_dir(parent);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动子进程失败 ({python_bin} {}): {e}", script.display()))?;

    let pid = child.id();

    // Check immediate exit
    tokio::time::sleep(Duration::from_millis(250)).await;
    if let Ok(Some(status)) = child.try_wait() {
        let msg = format!("本地服务启动后立即退出 (退出码: {status})，请检查Python环境");
        log::error!(target: "AI", "{msg}");
        return Err(msg);
    }

    // Poll health check up to 4 seconds
    let mut ready = false;
    for _ in 0..16 {
        tokio::time::sleep(Duration::from_millis(250)).await;
        if let Ok(Some(status)) = child.try_wait() {
            let msg = format!("本地服务进程异常退出 (退出代码: {status})");
            log::error!(target: "AI", "{msg}");
            return Err(msg);
        }
        if check_service_alive(port).await {
            ready = true;
            break;
        }
    }

    if !ready {
        let _ = child.kill();
        let msg = format!("本地服务在端口 {port} 超时未响应健康检查，请检查端口占用");
        log::warn!(target: "AI", "{msg}");
        return Err(msg);
    }

    log::info!(target: "AI", "本地决策服务健康检查通过 (HTTP 200)，端口 {} 已就绪 (PID: {})", port, pid);
    {
        let mut guard = LOCAL_PROCESS.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(child);
    }

    Ok(LocalServiceStatus {
        running: true,
        port,
        pid: Some(pid),
        message: format!("服务已成功启动，正在监听端口 {port}"),
    })
}

pub fn stop_service() -> LocalServiceStatus {
    let mut guard = LOCAL_PROCESS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut child) = guard.take() {
        let pid = child.id();
        let _ = child.kill();
        let _ = child.wait();
        log::info!(target: "AI", "停止本地模型服务子进程 (PID: {})，已释放端口", pid);
        LocalServiceStatus {
            running: false,
            port: 0,
            pid: None,
            message: format!("已成功停止服务并释放进程 (PID {pid})"),
        }
    } else {
        LocalServiceStatus {
            running: false,
            port: 0,
            pid: None,
            message: "服务当前未运行".into(),
        }
    }
}

fn find_python() -> String {
    if let Ok(py) = std::env::var("PYTHON") {
        if !py.trim().is_empty() {
            return py;
        }
    }
    for candidate in &["python", "py", "python3"] {
        if let Ok(output) = Command::new(candidate).arg("--version").output() {
            if output.status.success() {
                return candidate.to_string();
            }
        }
    }
    "python".into()
}

fn resolve_runner(custom_script: Option<&str>, models_dir: &Path) -> Result<(String, PathBuf), String> {
    let py = find_python();

    if let Some(custom) = custom_script {
        let p = PathBuf::from(custom);
        if p.exists() {
            return Ok((py, p));
        }
    }

    // 1. Current working directory
    let candidate1 = Path::new("scripts").join("decision_server.py");
    if candidate1.exists() {
        if let Ok(abs) = fs::canonicalize(&candidate1) {
            return Ok((py, abs));
        }
    }

    // 2. Parent directory (e.g. dev mode where cwd is src-tauri)
    let candidate2 = Path::new("../scripts").join("decision_server.py");
    if candidate2.exists() {
        if let Ok(abs) = fs::canonicalize(&candidate2) {
            return Ok((py, abs));
        }
    }

    // 3. Materialize embedded script into models_dir or temp directory
    let target_script = if let Some(parent) = models_dir.parent() {
        parent.join("scripts").join("decision_server.py")
    } else {
        std::env::temp_dir().join("ai-finance-moyu").join("decision_server.py")
    };

    if let Some(parent) = target_script.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&target_script, EMBEDDED_SCRIPT);

    Ok((py, target_script))
}
