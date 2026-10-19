use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE, ACCEPT_ENCODING};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tokio::time::sleep;

#[derive(Debug, Clone)]
pub enum StreamEvent {
    Thought(String),
    Chunk(String),
    ToolCallChunk { index: usize, id: Option<String>, name: Option<String>, arguments_delta: String },
    Done,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

/// The provider config now lives in its own module; re-exported here so every
/// existing `client::LlmConfig` path keeps working.
pub use super::config::LlmConfig;

use super::config::TransportConfig;

pub struct LlmClient {
    client: reqwest::Client,
    config: TransportConfig,
}

impl LlmClient {
    /// Build a client for one concrete endpoint.
    pub fn new(config: LlmConfig) -> Self {
        Self::from_transport(config.transport_view())
    }

    pub fn from_transport(config: TransportConfig) -> Self {
        // 遵循 Rule 4: .no_proxy() 避免本地代理影响国内端点访问
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        Self { client, config }
    }

    /// 解决 DeepSeek 回显陷阱：Assistant 携带 tool_calls 时必须回传 reasoning_content，为空时填充单空格 " "
    pub fn sanitize_messages_for_wire(&self, messages: &[ChatMessage]) -> Vec<ChatMessage> {
        messages.iter().map(|m| {
            let mut clone = m.clone();
            if self.config.is_deepseek_reasoner && clone.role == "assistant" && clone.tool_calls.is_some() {
                if clone.reasoning_content.is_none() {
                    clone.reasoning_content = Some(" ".to_string());
                }
            } else if !self.config.is_deepseek_reasoner {
                clone.reasoning_content = None;
            }
            clone
        }).collect()
    }

    pub async fn stream_chat<F>(&self, messages: &[ChatMessage], tools: Option<Value>, mut on_event: F) -> Result<(), String>
    where
        F: FnMut(StreamEvent),
    {
        let wire_messages = self.sanitize_messages_for_wire(messages);
        let mut body = serde_json::json!({
            "model": self.config.model_name,
            "messages": wire_messages,
            "stream": true,
        });

        if let Some(t) = tools {
            body["tools"] = t;
        }
        // Only send `enable_search` where a native search channel actually
        // exists. Providers without one reject the unknown field with a 400,
        // so honouring the toggle blindly turned a harmless switch into a hard
        // failure on half the presets.
        if self.config.enable_search && self.config.supports_native_search {
            body["enable_search"] = serde_json::json!(true);
        }
        // Only sent when the user actually chose a value: OpenAI-compatible
        // servers differ on whether `0` means "unset" or "deterministic".
        //
        // GPT-6 is the exception that breaks the rule — it rejects
        // `temperature` outright rather than ignoring it, so it must be
        // withheld entirely or every request comes back 400.
        if self.config.temperature > 0.0 && !self.config.rejects_sampling_params {
            body["temperature"] = serde_json::json!(self.config.temperature);
        }
        if self.config.max_tokens > 0 {
            body["max_tokens"] = serde_json::json!(self.config.max_tokens);
        }

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        if self.config.is_moonshot {
            headers.insert(ACCEPT_ENCODING, HeaderValue::from_static("gzip"));
        }
        if !self.config.api_key.is_empty() {
            let auth = format!("Bearer {}", self.config.api_key.trim());
            headers.insert(AUTHORIZATION, HeaderValue::from_str(&auth).map_err(|e| e.to_string())?);
        }
        // Provider-mandated headers, e.g. OpenCode Go answers 401 without
        // `x-opencode-session`. An unparseable name/value is skipped rather than
        // failing the whole request — a bad custom header should not look like
        // the model is broken.
        for (name, value) in &self.config.extra_headers {
            match (
                HeaderName::from_bytes(name.trim().as_bytes()),
                HeaderValue::from_str(value.trim()),
            ) {
                (Ok(n), Ok(v)) => {
                    headers.insert(n, v);
                }
                _ => log::warn!(target: "NET", "忽略非法自定义请求头: {name}"),
            }
        }

        let endpoint = format!("{}/chat/completions", self.config.base_url.trim_end_matches('/'));
        let mut attempts = 0;
        let max_retries = 3;

        loop {
            attempts += 1;
            let resp = self.client.post(&endpoint)
                .headers(headers.clone())
                .json(&body)
                .send()
                .await;

            let resp = match resp {
                Ok(r) => r,
                Err(e) if attempts <= max_retries => {
                    log::warn!(target: "NET", "API request network error: {}, retrying ({})...", e, attempts);
                    sleep(Duration::from_millis(1000 * 2_u64.pow(attempts - 1))).await;
                    continue;
                }
                Err(e) => return Err(format!("网络连接失败: {}", e)),
            };

            let status = resp.status();
            if status == 401 || status == 403 {
                return Err("API Key 无效或未授权，请检查设置。".to_string());
            } else if status == 429 {
                let retry_after = resp.headers().get("Retry-After")
                    .and_then(|v: &reqwest::header::HeaderValue| v.to_str().ok())
                    .and_then(|s: &str| s.parse::<u64>().ok())
                    .unwrap_or(2_u64.pow(attempts));
                if attempts <= max_retries {
                    log::warn!(target: "NET", "Rate limit 429. Backoff for {}s...", retry_after);
                    sleep(Duration::from_secs(retry_after.min(60))).await;
                    continue;
                }
                return Err("触发厂商频控限制 (429)，请稍后重试。".to_string());
            } else if status.is_server_error() && attempts <= max_retries {
                log::warn!(target: "NET", "Server error {}. Retrying...", status);
                sleep(Duration::from_millis(1500 * attempts as u64)).await;
                continue;
            } else if !status.is_success() {
                let err_text: String = resp.text().await.unwrap_or_default();
                return Err(format!("API 调用异常 ({}): {}", status, err_text));
            }

            self.parse_sse_stream(resp, &mut on_event).await?;
            return Ok(());
        }
    }

    async fn parse_sse_stream<F>(&self, mut resp: reqwest::Response, on_event: &mut F) -> Result<(), String>
    where
        F: FnMut(StreamEvent),
    {
        let mut buffer = String::new();
        let mut think_tag_active = false;
        let mut native_reasoning_seen = false;

        while let Some(chunk) = resp.chunk().await.map_err(|e| format!("流式传输中断: {}", e))? {
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim_end_matches('\r').to_string();
                buffer.drain(..=pos);

                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with(':') || trimmed.starts_with("event:") {
                    continue;
                }
                if let Some(payload) = trimmed.strip_prefix("data:") {
                    let payload = payload.trim();
                    if payload == "[DONE]" {
                        on_event(StreamEvent::Done);
                        return Ok(());
                    }
                    if let Ok(json) = serde_json::from_str::<Value>(payload) {
                        if let Some(delta) = json.get("choices").and_then(|c| c.get(0)).and_then(|c| c.get("delta")) {
                            // 1. 优先提取原生 DeepSeek-R1 思考流 delta.reasoning_content
                            let reasoning = delta.get("reasoning_content")
                                .or_else(|| delta.get("reasoning"))
                                .and_then(|v| v.as_str());
                            if let Some(r_text) = reasoning {
                                if !r_text.is_empty() {
                                    native_reasoning_seen = true;
                                    on_event(StreamEvent::Thought(r_text.to_string()));
                                }
                            }

                            // 2. 提取标准正文 delta.content
                            if let Some(content) = delta.get("content").and_then(|v| v.as_str()) {
                                if !native_reasoning_seen {
                                    let (clean_text, thought_part) = scrub_inline_think(content, &mut think_tag_active);
                                    if !thought_part.is_empty() {
                                        on_event(StreamEvent::Thought(thought_part));
                                    }
                                    if !clean_text.is_empty() {
                                        on_event(StreamEvent::Chunk(clean_text));
                                    }
                                } else if !content.is_empty() {
                                    on_event(StreamEvent::Chunk(content.to_string()));
                                }
                            }

                            // 3. 提取工具调用切片 delta.tool_calls
                            if let Some(tc_array) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                                for tc in tc_array {
                                    let index = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                                    let id = tc.get("id").and_then(|v| v.as_str()).map(ToString::to_string);
                                    let name = tc.get("function").and_then(|f| f.get("name")).and_then(|v| v.as_str()).map(ToString::to_string);
                                    let arguments_delta = tc.get("function").and_then(|f| f.get("arguments")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    on_event(StreamEvent::ToolCallChunk { index, id, name, arguments_delta });
                                }
                            }
                        }
                    }
                }
            }
        }
        on_event(StreamEvent::Done);
        Ok(())
    }
}

/// 状态机过滤内联 <think> 标签，防止网络分片将标签斩断导致泄露
fn scrub_inline_think(text: &str, in_tag: &mut bool) -> (String, String) {
    let mut clean = String::new();
    let mut thought = String::new();
    let mut remaining = text;

    while !remaining.is_empty() {
        if *in_tag {
            if let Some(close_idx) = remaining.find("</think>") {
                thought.push_str(&remaining[..close_idx]);
                remaining = &remaining[close_idx + 8..];
                *in_tag = false;
            } else {
                thought.push_str(remaining);
                break;
            }
        } else if let Some(open_idx) = remaining.find("<think>") {
            clean.push_str(&remaining[..open_idx]);
            remaining = &remaining[open_idx + 7..];
            *in_tag = true;
        } else {
            clean.push_str(remaining);
            break;
        }
    }
    (clean, thought)
}
