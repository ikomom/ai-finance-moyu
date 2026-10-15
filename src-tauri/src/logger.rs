//! Structured Rolling File & In-Memory Event Logger.
//!
//! Provides:
//! - Standard `log` facade implementation.
//! - Automatic rolling file appender (max 5MB/file, retains up to 3 archives: `app.log`, `app.1.log`, `app.2.log`).
//! - High-speed in-memory ring buffer (up to 200 entries) for real-time UI diagnosis & review in Settings.
//! - Categorized business tagging:
//!   - `ALERT`: crossing thresholds, rapid price surges/drops, volume bursts, limit boards.
//!   - `AUCTION`: call auction evaluations, fake spike bull trap, scare bear trap.
//!   - `SESSION`: A-share trading session state transitions.
//!   - `NET`: quote/trend fetch errors, retry attempts, baseline cache fallback.
//!   - `USER`: layout switching, watchlist updates, key preference changes.
//!   - `SYSTEM`: startup, window events, hotkey registrations.

use chrono::Local;
use log::{Level, LevelFilter, Metadata, Record};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const MAX_LOG_FILE_SIZE: u64 = 5 * 1024 * 1024; // 5 MB
const MAX_ARCHIVE_COUNT: usize = 3;
const MAX_MEMORY_ENTRIES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: u64,
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

struct LogWriter {
    file_path: PathBuf,
    current_size: u64,
}

impl LogWriter {
    fn new(file_path: PathBuf) -> Self {
        let current_size = fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);
        Self {
            file_path,
            current_size,
        }
    }

    fn write_line(&mut self, line: &str) {
        if self.current_size + line.len() as u64 >= MAX_LOG_FILE_SIZE {
            self.rotate();
        }

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
        {
            let bytes = line.as_bytes();
            if file.write_all(bytes).is_ok() {
                let _ = file.write_all(b"\n");
                let _ = file.flush();
                self.current_size += bytes.len() as u64 + 1;
            }
        }
    }

    fn rotate(&mut self) {
        let parent = match self.file_path.parent() {
            Some(p) => p,
            None => return,
        };

        // Remove the oldest archive if it exists
        let oldest = parent.join(format!("app.{}.log", MAX_ARCHIVE_COUNT));
        let _ = fs::remove_file(oldest);

        // Shift archives: app.2.log -> app.3.log, app.1.log -> app.2.log
        for i in (1..MAX_ARCHIVE_COUNT).rev() {
            let src = parent.join(format!("app.{i}.log"));
            let dst = parent.join(format!("app.{}.log", i + 1));
            if src.exists() {
                let _ = fs::rename(src, dst);
            }
        }

        // app.log -> app.1.log
        let archive1 = parent.join("app.1.log");
        let _ = fs::rename(&self.file_path, archive1);

        self.current_size = 0;
    }
}

pub struct MoyuLogger {
    writer: Mutex<Option<LogWriter>>,
    ring_buffer: Mutex<VecDeque<LogEntry>>,
    id_counter: AtomicU64,
    level_filter: AtomicUsize,
}

static LOGGER: MoyuLogger = MoyuLogger {
    writer: Mutex::new(None),
    ring_buffer: Mutex::new(VecDeque::new()),
    id_counter: AtomicU64::new(1),
    level_filter: AtomicUsize::new(LevelFilter::Info as usize),
};

impl log::Log for MoyuLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        let max_level = match self.level_filter.load(Ordering::Relaxed) {
            1 => LevelFilter::Error,
            2 => LevelFilter::Warn,
            3 => LevelFilter::Info,
            4 => LevelFilter::Debug,
            5 => LevelFilter::Trace,
            _ => LevelFilter::Info,
        };
        metadata.level() <= max_level
    }

    fn log(&self, record: &Record) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let now = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
        let level_str = record.level().to_string();
        let target = record.target();
        let message = format!("{}", record.args());

        // 1. Format text line
        let log_line = format!("[{now}][{level_str}][{target}] {message}");

        // 2. Output to stdout/stderr with clean format
        if record.level() == Level::Error {
            eprintln!("{log_line}");
        } else {
            println!("{log_line}");
        }

        // 3. Write to rolling file
        if let Ok(mut guard) = self.writer.lock() {
            if let Some(writer) = guard.as_mut() {
                writer.write_line(&log_line);
            }
        }

        // 4. Record to in-memory ring buffer
        let id = self.id_counter.fetch_add(1, Ordering::Relaxed);
        let entry = LogEntry {
            id,
            timestamp: now,
            level: level_str,
            target: target.to_string(),
            message,
        };

        if let Ok(mut buf) = self.ring_buffer.lock() {
            if buf.len() >= MAX_MEMORY_ENTRIES {
                buf.pop_front();
            }
            buf.push_back(entry);
        }
    }

    fn flush(&self) {}
}

/// Initialize the logger. Should be called once during app setup.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let dir = log_dir(app)?;
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    let log_file = dir.join("app.log");

    if let Ok(mut guard) = LOGGER.writer.lock() {
        *guard = Some(LogWriter::new(log_file));
    }

    let _ = log::set_logger(&LOGGER);
    log::set_max_level(LevelFilter::Debug);

    log::info!(target: "SYSTEM", "摸鱼看盘悬浮窗启动，日志持久化就绪: {}", dir.display());
    Ok(())
}

pub fn log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().app_log_dir() {
        return Ok(dir);
    }
    Ok(crate::config::config_dir(app)?.join("logs"))
}

pub fn get_recent_entries(target_filter: Option<&str>, level_filter: Option<&str>) -> Vec<LogEntry> {
    let guard = match LOGGER.ring_buffer.lock() {
        Ok(g) => g,
        Err(e) => e.into_inner(),
    };

    guard
        .iter()
        .filter(|e| {
            if let Some(target) = target_filter {
                if !target.is_empty() && !target.eq_ignore_ascii_case("ALL") && !e.target.eq_ignore_ascii_case(target) {
                    return false;
                }
            }
            if let Some(level) = level_filter {
                if !level.is_empty() && !level.eq_ignore_ascii_case("ALL") && !e.level.eq_ignore_ascii_case(level) {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect()
}

pub fn clear_memory_entries() {
    if let Ok(mut guard) = LOGGER.ring_buffer.lock() {
        guard.clear();
    }
}

pub fn set_level(level_name: &str) {
    let filter = match level_name.to_uppercase().as_str() {
        "ERROR" => LevelFilter::Error,
        "WARN" => LevelFilter::Warn,
        "INFO" => LevelFilter::Info,
        "DEBUG" => LevelFilter::Debug,
        "TRACE" => LevelFilter::Trace,
        _ => LevelFilter::Info,
    };
    LOGGER.level_filter.store(filter as usize, Ordering::Relaxed);
}

pub fn open_log_directory(app: &AppHandle) -> Result<(), String> {
    let dir = log_dir(app)?;
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }

    #[cfg(windows)]
    {
        let path_str = dir.display().to_string();
        std::process::Command::new("explorer")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("打开日志目录失败: {e}"))?;
    }

    #[cfg(not(windows))]
    {
        let path_str = dir.display().to_string();
        std::process::Command::new("xdg-open")
            .arg(&path_str)
            .spawn()
            .map_err(|e| format!("打开日志目录失败: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn ring_buffer_respects_capacity() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_memory_entries();
        let logger = &LOGGER;
        use log::Log;

        for i in 0..250 {
            let msg = format!("test message {i}");
            let args = format_args!("{msg}");
            let record = Record::builder()
                .args(args)
                .level(Level::Info)
                .target("TEST")
                .build();
            logger.log(&record);
        }

        let entries = get_recent_entries(Some("TEST"), None);
        assert_eq!(entries.len(), MAX_MEMORY_ENTRIES);
        assert_eq!(entries.last().unwrap().message, "test message 249");
    }

    #[test]
    fn filtering_by_level_and_target() {
        let _guard = TEST_LOCK.lock().unwrap();
        clear_memory_entries();
        let logger = &LOGGER;
        use log::Log;

        let r1 = Record::builder().args(format_args!("m1")).level(Level::Info).target("ALERT").build();
        let r2 = Record::builder().args(format_args!("m2")).level(Level::Warn).target("NET").build();
        let r3 = Record::builder().args(format_args!("m3")).level(Level::Error).target("ALERT").build();
        logger.log(&r1);
        logger.log(&r2);
        logger.log(&r3);

        let alert_entries = get_recent_entries(Some("ALERT"), None);
        assert_eq!(alert_entries.len(), 2);

        let warn_entries = get_recent_entries(None, Some("WARN"));
        assert_eq!(warn_entries.len(), 1);
        assert_eq!(warn_entries[0].message, "m2");
    }
}
