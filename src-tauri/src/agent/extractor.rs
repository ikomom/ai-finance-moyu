use serde_json::Value;
use std::sync::Arc;
use tauri::AppHandle;
use super::client::{ChatMessage, LlmClient, LlmConfig, StreamEvent};
use super::memory::{MemoryEngine, MemoryMutation};
use super::prompts::PromptBuilder;

pub struct BackgroundMemoryExtractor;

impl BackgroundMemoryExtractor {
    /// 触发异步后台事实萃取 Worker，不阻塞主对话流与 UI
    pub fn spawn(
        memory_engine: Arc<MemoryEngine>,
        llm_config: LlmConfig,
        user_message: String,
        assistant_reply: String,
        app_handle: Option<AppHandle>,
    ) {
        if !llm_config.has_key() {
            return;
        }

        tokio::spawn(async move {
            if let Err(e) = Self::extract_and_apply(&memory_engine, &llm_config, &user_message, &assistant_reply, app_handle.as_ref()).await {
                log::debug!(target: "SYSTEM", "Background memory extraction skipped: {}", e);
            }
        });
    }

    async fn extract_and_apply(
        memory_engine: &MemoryEngine,
        llm_config: &LlmConfig,
        user_msg: &str,
        assistant_reply: &str,
        app: Option<&AppHandle>,
    ) -> Result<(), String> {
        let dialogue_input = format!("User: {}\nAssistant: {}", user_msg, assistant_reply);
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: Some(PromptBuilder::FACT_EXTRACTION_PROMPT.to_string()),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
            },
            ChatMessage {
                role: "user".to_string(),
                content: Some(dialogue_input),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let client = LlmClient::new(llm_config.clone());
        let mut response_text = String::new();

        client.stream_chat(&messages, None, |ev| {
            if let StreamEvent::Chunk(c) = ev {
                response_text.push_str(&c);
            }
        }).await?;

        // 尝试从可能包含 Markdown 代码块的文本中提取纯 JSON
        let trimmed = response_text.trim();
        let json_str = if let Some(start) = trimmed.find('[') {
            if let Some(end) = trimmed.rfind(']') {
                &trimmed[start..=end]
            } else {
                trimmed
            }
        } else {
            trimmed
        };

        let parsed: Value = serde_json::from_str(json_str)
            .map_err(|e| format!("解析事实提取结果失败: {} | 原文: {}", e, json_str))?;

        if let Some(facts) = parsed.as_array() {
            for item in facts {
                let confidence = item.get("confidence").and_then(|v| v.as_f64()).unwrap_or(0.0);
                if confidence < 0.75 {
                    continue;
                }

                let fact_text = match item.get("fact").and_then(|v| v.as_str()) {
                    Some(f) if !f.trim().is_empty() => f.trim().to_string(),
                    _ => continue,
                };

                let target = match item.get("target_file").and_then(|v| v.as_str()) {
                    Some("USER") => "USER".to_string(),
                    _ => "MEMORY".to_string(),
                };

                let category = item.get("category").and_then(|v| v.as_str()).unwrap_or("HABIT");
                let section = match category {
                    "COMMITMENT" => "Active Portfolio Commitments",
                    "POSITION" => "Portfolio & Cost Line",
                    "PSYCHOLOGY" => "Trading Habits & Style",
                    _ => "Trading Habits & Style",
                };

                let mutation = MemoryMutation {
                    target,
                    action: "ADD".to_string(),
                    section: Some(section.to_string()),
                    old_text: None,
                    new_text: Some(fact_text),
                };

                let _ = memory_engine.apply_mutation(&mutation, app);
                log::info!(target: "SYSTEM", "Memory fact extracted & saved: category={}", category);
            }
        }

        Ok(())
    }
}
