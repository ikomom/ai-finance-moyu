//! Real provider probe for the settings screen.
//!
//! This exists because the old "test connection" button called the normal chat
//! command with no symbol. That path silently falls back to the local rule
//! engine when no key is stored, returns a perfectly ordinary string, and the
//! frontend — which only checked "did it throw?" — stamped a green ✅ on it.
//! A user with no API key at all was told their connection was fine.
//!
//! So this probe never touches the agent loop. It sends one minimal,
//! non-streaming request straight to the provider and reports exactly which
//! stage failed. Split out of `client.rs` to keep that file inside the 300-line
//! budget (AGENTS.md §11).

use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

use super::config::LlmConfig;
use super::profile::LlmProfile;

/// Sentinel reply we ask for. Short so the probe stays cheap.
const PROBE_PROMPT: &str = "只回复两个字：就绪";

/// Output tokens requested. Deliberately tiny — this probe verifies auth and
/// model reachability, not answer quality.
const PROBE_MAX_TOKENS: u32 = 32;

/// How long a probe may take. Short enough that a wrong base URL fails fast
/// instead of hanging the settings window behind a spinner.
const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    /// One of `ok` / `no_key` / `auth_failed` / `rate_limited` /
    /// `insufficient_balance` / `model_unavailable` / `network` /
    /// `server_error` / `bad_response`.
    pub status: String,
    /// Whether the provider actually answered a real request. The UI must only
    /// show a green check when this is true.
    pub reachable: bool,
    pub latency_ms: u64,
    pub model: String,
    pub base_url: String,
    pub has_key: bool,
    /// Whatever the model replied, trimmed. Useful for confirming you are
    /// pointed at the endpoint you think you are.
    pub reply: String,
    /// Human-readable explanation, safe to show as-is.
    pub detail: String,
}

impl HealthReport {
    /// Skeleton carrying the provider identity, so every branch below only has
    /// to state the part it actually knows.
    fn skeleton(cfg: &LlmConfig) -> Self {
        let view = cfg.transport_view();
        let has_key = view.has_key();
        Self {
            status: "ok".to_string(),
            reachable: false,
            latency_ms: 0,
            model: view.model_name,
            base_url: view.base_url,
            has_key,
            reply: String::new(),
            detail: String::new(),
        }
    }
}

/// Run the probe against the stored provider config.
pub async fn probe(config: &LlmConfig) -> HealthReport {
    let cfg = config.clone().with_derived_flags();
    let transport = cfg.transport_view();
    let mut report = HealthReport::skeleton(&cfg);

    if !cfg.has_key() {
        report.status = "no_key".into();
        report.detail =
            "尚未配置 API Key，当前复盘走的是本地确定性规则引擎，未接入大模型。".into();
        return report;
    }

    let started = Instant::now();

    let client = match reqwest::Client::builder().no_proxy().timeout(PROBE_TIMEOUT).build() {
        Ok(c) => c,
        Err(e) => {
            report.status = "network".into();
            report.detail = format!("构建 HTTP 客户端失败：{e}");
            return report;
        }
    };

    // Deliberately minimal: no tools, no search, no temperature. Several
    // reasoning models reject a temperature other than 1, and `enable_search`
    // is not universally supported — neither belongs in a reachability check.
    let body = serde_json::json!({
        "model": transport.model_name,
        "messages": [{ "role": "user", "content": PROBE_PROMPT }],
        "stream": false,
        "max_tokens": PROBE_MAX_TOKENS,
    });

    let endpoint = format!("{}/chat/completions", transport.base_url);

    let mut request = client
        .post(&endpoint)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", transport.api_key.trim()),
        )
        .json(&body);

    // OpenCode Go and friends require provider-specific headers; omitting one
    // yields a401 that reads like a bad key.
    for (name, value) in &transport.extra_headers {
        if let Ok(header_name) = reqwest::header::HeaderName::from_bytes(name.trim().as_bytes()) {
            if let Ok(v) = reqwest::header::HeaderValue::from_str(value.trim()) {
                request = request.header(header_name, v);
            }
        }
    }

    let resp = match request.send().await {
        Ok(r) => r,
        Err(e) => {
            report.status = "network".into();
            report.detail = format!("无法连接 {endpoint}：{e}");
            return report;
        }
    };

    let status = resp.status();
    let payload: Value = resp.json().await.unwrap_or(Value::Null);
    report.latency_ms = started.elapsed().as_millis() as u64;

    if status.is_success() {
        // A reasoning model may return only `reasoning_content` at this token
        // budget. That still proves auth and the model id are good, so treat a
        // 200 as success regardless of which content field came back.
        report.reachable = true;
        report.status = "ok".into();
        report.reply = payload
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .or_else(|| {
                payload
                    .pointer("/choices/0/message/reasoning_content")
                    .and_then(|v| v.as_str())
            })
            .unwrap_or("")
            .trim()
            .chars()
            .take(40)
            .collect();
        report.detail = format!("模型 {} 调用成功，往返 {} ms。", transport.model_name, report.latency_ms);
        return report;
    }

    let raw = serde_json::to_string(&payload).unwrap_or_default();
    let (name, detail) = classify(status.as_u16(), &raw);
    report.status = name.into();
    report.detail = detail;
    report
}

/// Map an HTTP failure onto a stage the UI can explain.
///
/// The body matters more than the code: several providers answer quota
/// exhaustion with 400 or 402 rather than 429, and a key that works but is out
/// of credit must not be reported as "invalid key" — the user's fix differs.
fn classify(code: u16, raw: &str) -> (&'static str, String) {
    let lower = raw.to_lowercase();

    let mentions = |needles: &[&str]| needles.iter().any(|n| lower.contains(n));

    if code == 401 || code == 403 || mentions(&["invalid api key", "incorrect api key", "authentication"]) {
        return (
            "auth_failed",
            format!("鉴权被拒绝 (HTTP {code})：API Key 无效或没有该模型的权限。"),
        );
    }
    if code == 429 || mentions(&["rate limit", "too many requests", "insufficient_quota"]) {
        return (
            "rate_limited",
            format!("触发厂商频控或配额限制 (HTTP {code})，请稍后重试或检查账户配额。"),
        );
    }
    if code == 402 || mentions(&["insufficient balance", "insufficient_balance", "not enough balance", "arrearage"]) {
        return (
            "insufficient_balance",
            format!("账户余额或额度不足 (HTTP {code})，请前往厂商控制台充值后重试。"),
        );
    }
    if code == 404
        || mentions(&[
            "model not found",
            "model_not_found",
            "model not exist",
            "invalid model",
            "no such model",
            "does not exist",
        ])
    {
        return (
            "model_unavailable",
            format!("HTTP {code}：模型标识不存在或当前 Key 无权访问。请核对模型名称。"),
        );
    }
    if (500..600).contains(&code) {
        return (
            "server_error",
            format!("厂商服务端异常 (HTTP {code})，稍后重试或更换服务商。"),
        );
    }

    // Truncated: some providers return a large HTML error page, and the
    // settings pane has no room for it.
    let snippet: String = raw.chars().take(160).collect();
    (
        "bad_response",
        format!("HTTP {code}：{snippet}"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The regression that motivated this module: a missing key must never be
    /// reported as a healthy connection.
    #[test]
    fn no_key_is_not_a_success() {
        let mut profile = LlmProfile::default();
        profile.api_key = String::new();
        let cfg = LlmConfig {
            profiles: vec![profile],
            ..Default::default()
        };
        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let report = rt.block_on(probe(&cfg));

        assert_eq!(report.status, "no_key");
        assert!(!report.reachable, "a missing key must not count as reachable");
    }

    /// A key stored on a *different* profile than the active one must not make
    /// the probe report success — otherwise switching models would appear to
    /// work right up until the request went out with the wrong credential.
    #[test]
    fn a_key_on_an_inactive_profile_does_not_count() {
        let mut other = LlmProfile::default();
        other.id = "other".into();
        other.api_key = "sk-unrelated".into();

        let mut active = LlmProfile::default();
        active.id = "active".into();
        active.api_key = String::new();

        let cfg = LlmConfig {
            profiles: vec![other, active],
            active_profile_id: "active".into(),
            ..Default::default()
        };

        let rt = tokio::runtime::Runtime::new().expect("runtime");
        let report = rt.block_on(probe(&cfg));
        assert_eq!(report.status, "no_key");
    }

    #[test]
    fn auth_failure_is_distinguished_from_quota() {
        assert_eq!(classify(401, "{}").0, "auth_failed");
        assert_eq!(classify(429, "{}").0, "rate_limited");
        assert_eq!(classify(402, "{}").0, "insufficient_balance");
        assert_eq!(classify(404, "{}").0, "model_unavailable");
        assert_eq!(classify(503, "{}").0, "server_error");
    }

    /// DeepSeek answers quota exhaustion with 400 and a prose body, so the
    /// message has to be inspected even when the code looks generic.
    #[test]
    fn quota_exhaustion_in_body_is_caught_on_a_400() {
        let (status, _) = classify(400, r#"{"error":{"message":"Insufficient balance"}}"#);
        assert_eq!(status, "insufficient_balance");
    }

    #[test]
    fn unknown_model_is_caught_from_the_body() {
        let (status, _) = classify(400, r#"{"error":{"message":"Model Not Exist"}}"#);
        assert_eq!(status, "model_unavailable");
    }
}
