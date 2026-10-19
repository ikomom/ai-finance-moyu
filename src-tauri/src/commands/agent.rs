use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::agent::{
    BackgroundMemoryExtractor, ChatSession, ChatSessionSummary, HealthReport, LlmConfig,
    LoopEngine, MemoryEngine, MemoryManifest, MemoryMutation, SessionEngine, StreamEvent,
};
use crate::config::config_dir;
use crate::state::AppState;

// Provider profile persistence lives in `agent_config.rs`; this file keeps the
// chat command and the connection probe.
use super::agent_config;

#[tauri::command]
pub fn get_agent_config(app: AppHandle) -> Result<agent_config::AgentConfigView, String> {
    Ok(agent_config::to_view(&agent_config::load(&app)))
}

#[tauri::command]
pub fn save_agent_config(app: AppHandle, config: LlmConfig) -> Result<(), String> {
    agent_config::save(&app, config)
}

#[tauri::command]
pub fn set_active_profile(app: AppHandle, profile_id: String) -> Result<agent_config::AgentConfigView, String> {
    agent_config::activate(&app, &profile_id)
}

/// Probe the configured provider with one real, minimal request.
///
/// Replaces the old "send a chat message and see if a string comes back"
/// check, which reported success even when no key was configured at all —
/// because the agent loop quietly serves the local rule engine in that case.
/// This never touches the agent loop, so `reachable` means the provider
/// actually answered.
#[tauri::command]
pub async fn check_agent_connection(app: AppHandle) -> Result<HealthReport, String> {
    let cfg = agent_config::load(&app);
    Ok(crate::agent::health::probe(&cfg).await)
}

#[tauri::command]
pub fn get_memory_manifest(app: AppHandle) -> Result<MemoryManifest, String> {
    let dir = config_dir(&app)?;
    let engine = MemoryEngine::new(&dir);
    Ok(engine.load_manifest())
}

#[tauri::command]
pub fn save_memory_mutation(app: AppHandle, mutation: MemoryMutation) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let engine = MemoryEngine::new(&dir);
    engine.apply_mutation(&mutation, Some(&app))
}

#[tauri::command]
pub fn get_chat_sessions(app: AppHandle) -> Result<Vec<ChatSessionSummary>, String> {
    let dir = config_dir(&app)?;
    let engine = SessionEngine::new(&dir);
    engine.list_sessions()
}

#[tauri::command]
pub fn get_chat_session(app: AppHandle, id: String) -> Result<ChatSession, String> {
    let dir = config_dir(&app)?;
    let engine = SessionEngine::new(&dir);
    engine.get_session(&id)
}

#[tauri::command]
pub fn save_chat_session(app: AppHandle, session: ChatSession) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let engine = SessionEngine::new(&dir);
    engine.save_session(&session)
}

#[tauri::command]
pub fn delete_chat_session(app: AppHandle, id: String) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let engine = SessionEngine::new(&dir);
    engine.delete_session(&id)
}

#[tauri::command]
pub fn clear_chat_sessions(app: AppHandle) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let engine = SessionEngine::new(&dir);
    engine.clear_all()
}

/// One prior turn as the frontend stored it.
///
/// Deliberately not `ChatMessageItem`: that struct carries persistence fields
/// (`id`, `timestamp`, `symbol`) the agent loop has no use for, and reusing it
/// here would force the wire format to grow with the session file.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorTurn {
    pub role: String,
    #[serde(default)]
    pub content: String,
    /// Accepted but ignored: only the visible answer is worth replaying, and
    /// re-sending a truncated reasoning trace buys nothing but tokens.
    #[serde(default)]
    pub thought: Option<String>,
}

impl PriorTurn {
    /// The longest prior turn worth sending. A review card is ~2k characters;
    /// anything far beyond that is a runaway transcript, not a conversation.
    const MAX_CHARS: usize = 4000;

    fn into_message(self) -> Option<crate::agent::ChatMessage> {
        if !matches!(self.role.as_str(), "user" | "assistant") {
            return None;
        }
        let content: String = self.content.trim().chars().take(Self::MAX_CHARS).collect();
        if content.is_empty() {
            return None;
        }
        Some(crate::agent::ChatMessage {
            role: self.role,
            content: Some(content),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        })
    }
}

#[tauri::command]
pub async fn chat_with_agent(
    app: AppHandle,
    state: State<'_, AppState>,
    symbol: Option<String>,
    current_symbol: Option<String>,
    prompt: Option<String>,
    message: Option<String>,
    history: Option<Vec<PriorTurn>>,
) -> Result<String, String> {
    let sym = symbol.or(current_symbol).unwrap_or_default();
    let user_prompt = prompt.or(message).unwrap_or_default();
    let dir = config_dir(&app)?;
    let memory_engine = Arc::new(MemoryEngine::new(&dir));
    let llm_config = agent_config::load(&app);

    // The transcript the UI already holds. Without this the model saw only the
    // latest message, so "展开一下刚才那个结论" had no referent.
    let prior: Vec<crate::agent::ChatMessage> = history
        .unwrap_or_default()
        .into_iter()
        .filter_map(PriorTurn::into_message)
        .collect();

    let app_emitter = app.clone();
    let full_reply = LoopEngine::run_conversation_turn(
        &state,
        &memory_engine,
        &llm_config,
        &sym,
        &user_prompt,
        &prior,
        move |event| match event {
            StreamEvent::Thought(chunk) => {
                let _ = app_emitter.emit("agent://thought", serde_json::json!({ "thought": chunk }));
            }
            StreamEvent::Chunk(chunk) => {
                let _ = app_emitter.emit("agent://chunk", serde_json::json!({ "delta": chunk }));
            }
            StreamEvent::Done => {
                let _ = app_emitter.emit("agent://done", serde_json::json!({ "content": "", "thought": "" }));
            }
            StreamEvent::Error(err) => {
                let _ = app_emitter.emit("agent://error", serde_json::json!({ "error": err }));
            }
            StreamEvent::ToolCallChunk { .. } => {}
        },
    )
    .await?;

    // 对话顺利完成后，由后台异步提取事实更新记忆档案
    BackgroundMemoryExtractor::spawn(
        memory_engine,
        llm_config,
        user_prompt,
        full_reply.clone(),
        Some(app),
    );

    Ok(full_reply)
}
