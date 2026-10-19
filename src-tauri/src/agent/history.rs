//! Chat session persistence and management for AI Copilot reviews.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessageItem {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thought: Option<String>,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSessionSummary {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol_name: Option<String>,
    pub updated_at: i64,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol_name: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub messages: Vec<ChatMessageItem>,
}

#[derive(Clone)]
pub struct SessionEngine {
    base_dir: PathBuf,
}

impl SessionEngine {
    pub fn new(app_dir: &Path) -> Self {
        let base_dir = app_dir.join("agent_sessions");
        if !base_dir.exists() {
            let _ = fs::create_dir_all(&base_dir);
        }
        Self { base_dir }
    }

    fn session_file(&self, id: &str) -> PathBuf {
        let safe_id = id.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_");
        self.base_dir.join(format!("{}.json", safe_id))
    }

    pub fn list_sessions(&self) -> Result<Vec<ChatSessionSummary>, String> {
        if !self.base_dir.exists() {
            return Ok(Vec::new());
        }

        let mut list = Vec::new();
        let entries = fs::read_dir(&self.base_dir).map_err(|e| e.to_string())?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(sess) = serde_json::from_str::<ChatSession>(&content) {
                        list.push(ChatSessionSummary {
                            id: sess.id,
                            title: sess.title,
                            symbol: sess.symbol,
                            symbol_name: sess.symbol_name,
                            updated_at: sess.updated_at,
                            message_count: sess.messages.len(),
                        });
                    }
                }
            }
        }

        list.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(list)
    }

    pub fn get_session(&self, id: &str) -> Result<ChatSession, String> {
        let path = self.session_file(id);
        if !path.exists() {
            return Err(format!("未找到会话: {}", id));
        }

        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| format!("解析会话失败: {}", e))
    }

    pub fn save_session(&self, session: &ChatSession) -> Result<(), String> {
        let path = self.session_file(&session.id);
        let content = serde_json::to_string_pretty(session).map_err(|e| e.to_string())?;

        let tmp_path = path.with_extension("tmp");
        {
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(&tmp_path)
                .map_err(|e| e.to_string())?;
            file.write_all(content.as_bytes()).map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &path).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_session(&self, id: &str) -> Result<(), String> {
        let path = self.session_file(id);
        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn clear_all(&self) -> Result<(), String> {
        if self.base_dir.exists() {
            for entry in fs::read_dir(&self.base_dir).map_err(|e| e.to_string())?.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    let _ = fs::remove_file(&path);
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_engine_crud() {
        let temp_dir = std::env::temp_dir().join(format!(
            "ai_test_sess_{}",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        let engine = SessionEngine::new(&temp_dir);

        let session = ChatSession {
            id: "sess_test_1".to_string(),
            title: "工商银行 · 盘后复盘".to_string(),
            symbol: Some("sh601398".to_string()),
            symbol_name: Some("工商银行".to_string()),
            created_at: 1792330000,
            updated_at: 1792331000,
            messages: vec![ChatMessageItem {
                id: "m_1".to_string(),
                role: "user".to_string(),
                content: "多空定调".to_string(),
                thought: None,
                timestamp: 1792330000,
                symbol: Some("sh601398".to_string()),
            }],
        };

        engine.save_session(&session).expect("save should succeed");

        let loaded = engine.get_session("sess_test_1").expect("should load");
        assert_eq!(loaded.title, "工商银行 · 盘后复盘");
        assert_eq!(loaded.messages.len(), 1);

        let list = engine.list_sessions().expect("list should succeed");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "sess_test_1");

        engine.delete_session("sess_test_1").expect("delete should succeed");
        assert!(engine.get_session("sess_test_1").is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
