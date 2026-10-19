use serde_json::Value;
use crate::market::session_at;
use crate::state::AppState;
use super::client::{ChatMessage, LlmClient, LlmConfig, StreamEvent};
use super::fallback::HeuristicFallbackEngine;
use super::finance_tools::FinanceTools;
use super::guardrails::{GuardrailDecision, ToolCallGuardrailController};
use super::memory::MemoryEngine;
use super::prompts::PromptBuilder;

/// Wrap the local rule-engine card in an explicit degradation banner.
///
/// The card body is styled identically to a model answer, so without this the
/// user cannot tell which one produced it — the earlier version only appended a
/// small italic footnote at the very bottom, below a wall of numbers nobody
/// scrolls back to. Degradation is stated first or it is not stated.
fn fallback_card(state: &AppState, symbol: &str, reason: &str) -> String {
    let body = HeuristicFallbackEngine::generate_card(state, symbol);
    format!(
        "> ⚠️ **本地规则引擎输出**（非大模型推理）\n\
        > 原因：{reason}。以下结论由本地确定性量价规则计算，**未经大模型分析**，行情延迟或未刷新时结论可能失效。\n\
        > 如需深度推演，请在【设置 → AI 智囊】中配置 API Key 后重试。\n\n\
        ---\n\n{body}"
    )
}

pub struct LoopEngine;

impl LoopEngine {
    /// Upper bound on prior turns replayed into context.
    ///
    /// Recent turns matter far more than old ones for "展开刚才那个结论", so
    /// the transcript is trimmed from the front when it grows past this. The
    /// system prompt itself already carries the market snapshot.
    const MAX_PRIOR_TURNS: usize = 10;

    /// Execute one full conversation turn: optional prior turns, one user
    /// message, and as many tool-calling round trips as the model needs.
    pub async fn run_conversation_turn<F>(
        state: &AppState,
        memory_engine: &MemoryEngine,
        llm_config: &LlmConfig,
        symbol: &str,
        user_prompt: &str,
        prior_turns: &[ChatMessage],
        mut on_event: F,
    ) -> Result<String, String>
    where
        F: FnMut(StreamEvent),
    {
        // 1. 若活动档案没有可用凭据，直接降级为确定性规则引擎保底输出（严格践行 Rule 2）
        if !llm_config.has_key() {
            let card = fallback_card(state, symbol, "未配置 API Key");
            on_event(StreamEvent::Chunk(card.clone()));
            on_event(StreamEvent::Done);
            return Ok(card);
        }

        // 2. 组装三层提示词
        let now = chrono::Local::now().naive_local();
        let session = session_at(now);
        let manifest = memory_engine.load_manifest();

        let snapshot_summary = match FinanceTools::execute(state, "get_security_snapshot", &serde_json::json!({ "symbol": symbol })) {
            Ok(v) => serde_json::to_string_pretty(&v).unwrap_or_default(),
            Err(_) => format!("代码: {}", symbol),
        };

        let system_prompt = PromptBuilder::build_system_prompt(
            &manifest.soul_md,
            session,
            &manifest.user_md,
            &manifest.memory_md,
            &snapshot_summary,
        );

        let mut messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: Some(system_prompt),
                reasoning_content: None,
                tool_calls: None,
                tool_call_id: None,
            },
        ];

        let start = prior_turns.len().saturating_sub(Self::MAX_PRIOR_TURNS);
        messages.extend_from_slice(&prior_turns[start..]);

        messages.push(ChatMessage {
            role: "user".to_string(),
            content: Some(user_prompt.to_string()),
            reasoning_content: None,
            tool_calls: None,
            tool_call_id: None,
        });

        let tools = Some(FinanceTools::get_tool_definitions());
        let client = LlmClient::new(llm_config.clone());
        let mut guardrails = ToolCallGuardrailController::default();
        guardrails.start_turn();

        let mut final_full_text = String::new();

        // 3. 执行推理与工具调用循环
        loop {
            if let Err(e) = guardrails.check_step_limit() {
                on_event(StreamEvent::Chunk(format!("\n\n> ⚠️ {}", e)));
                break;
            }

            let mut current_turn_text = String::new();
            let mut current_turn_thought = String::new();
            let mut pending_tool_calls: std::collections::HashMap<usize, (Option<String>, Option<String>, String)> = std::collections::HashMap::new();

            let chat_res = client.stream_chat(&messages, tools.clone(), |ev| match ev {
                StreamEvent::Thought(ref t) => {
                    current_turn_thought.push_str(t);
                    on_event(StreamEvent::Thought(t.clone()));
                }
                StreamEvent::Chunk(ref c) => {
                    current_turn_text.push_str(c);
                    final_full_text.push_str(c);
                    on_event(StreamEvent::Chunk(c.clone()));
                }
                StreamEvent::ToolCallChunk { index, id, name, arguments_delta } => {
                    let entry = pending_tool_calls.entry(index).or_insert((None, None, String::new()));
                    if id.is_some() { entry.0 = id; }
                    if name.is_some() { entry.1 = name; }
                    entry.2.push_str(&arguments_delta);
                }
                StreamEvent::Done => {}
                StreamEvent::Error(ref e) => {
                    on_event(StreamEvent::Error(e.clone()));
                }
            }).await;

            if let Err(e) = chat_res {
                log::warn!(target: "NET", "LLM chat failed: {}, falling back to local heuristic card", e);
                let fallback = fallback_card(state, symbol, &format!("大模型调用失败（{e}）"));
                on_event(StreamEvent::Chunk(fallback.clone()));
                final_full_text.push_str(&fallback);
                break;
            }

            // 若无工具调用发起，则本轮对话完成
            if pending_tool_calls.is_empty() {
                break;
            }

            // 组装并执行工具调用
            let mut tool_calls_json = Vec::new();
            for (idx, (id, name, args_str)) in pending_tool_calls.into_iter() {
                let call_id = id.unwrap_or_else(|| format!("call_{}", idx));
                let func_name = name.unwrap_or_default();
                tool_calls_json.push(serde_json::json!({
                    "id": call_id,
                    "type": "function",
                    "function": {
                        "name": func_name,
                        "arguments": args_str
                    }
                }));
            }

            // 压入 Assistant 消息（附带单空格 reasoning_content 解决 DeepSeek 回显 400 陷阱）
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: if current_turn_text.is_empty() { None } else { Some(current_turn_text) },
                reasoning_content: if current_turn_thought.is_empty() { Some(" ".to_string()) } else { Some(current_turn_thought) },
                tool_calls: Some(Value::Array(tool_calls_json.clone())),
                tool_call_id: None,
            });

            // 执行每个工具调用
            let mut halted = false;
            for tc in tool_calls_json {
                let call_id = tc["id"].as_str().unwrap_or_default().to_string();
                let func_name = tc["function"]["name"].as_str().unwrap_or_default().to_string();
                let args_str = tc["function"]["arguments"].as_str().unwrap_or_default();
                let args_val = serde_json::from_str::<Value>(args_str).unwrap_or(Value::Null);

                // 预检只读：连续失败达阈值后拦截（不再像旧实现那样先把计数清零）
                let precheck = guardrails.precheck(&func_name, args_str);
                let warning = match &precheck {
                    GuardrailDecision::Warning(msg) => Some(msg.clone()),
                    _ => None,
                };

                let tool_result_str = match precheck {
                    GuardrailDecision::HardHalt(msg) => {
                        halted = true;
                        serde_json::to_string(&serde_json::json!({ "error": msg, "halted": true }))
                            .unwrap_or_default()
                    }
                    _ => {
                        let outcome = FinanceTools::execute(state, &func_name, &args_val);
                        guardrails.record_result(&func_name, args_str, outcome.is_err());
                        match outcome {
                            Ok(res) => match warning {
                                // 把守卫警告连同结果回灌给模型，否则模型永远看不到它
                                Some(w) => serde_json::to_string(&serde_json::json!({
                                    "guardrail_warning": w,
                                    "result": res,
                                }))
                                .unwrap_or_default(),
                                None => serde_json::to_string(&res).unwrap_or_default(),
                            },
                            Err(err) => match warning {
                                Some(w) => serde_json::to_string(&serde_json::json!({
                                    "guardrail_warning": w,
                                    "error": err,
                                }))
                                .unwrap_or_default(),
                                None => serde_json::to_string(&serde_json::json!({ "error": err }))
                                    .unwrap_or_default(),
                            },
                        }
                    }
                };

                messages.push(ChatMessage {
                    role: "tool".to_string(),
                    content: Some(tool_result_str),
                    reasoning_content: None,
                    tool_calls: None,
                    tool_call_id: Some(call_id),
                });
            }

            // 硬熔断后立刻结束本轮，避免继续消耗配额做注定失败的调用
            if halted {
                on_event(StreamEvent::Chunk(
                    "\n\n> ⚠️ 工具调用已被熔断保护中止，请调整策略后重试。".to_string(),
                ));
                break;
            }
        }

        on_event(StreamEvent::Done);
        Ok(final_full_text)
    }
}
