//! One configured provider endpoint.
//!
//! Split from `config.rs` so the transport layer stays focused and every file
//! stays inside the 300-line budget (AGENTS.md §11).

use serde::{Deserialize, Serialize};

/// A single provider entry the user has configured.
///
/// Every profile owns its own endpoint, credential and model. Switching the
/// active model in the copilot therefore switches the whole chain, not just the
/// model id — you cannot send a `kimi-k2.6` id to a DeepSeek key.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LlmProfile {
    /// Stable identifier, kept across edits so the active selection survives a
    /// rename. `custom` profiles use a caller-supplied id.
    pub id: String,
    /// User-visible label. Defaults to the preset name.
    pub label: String,
    /// Provider preset id (`deepseek` / `opencode_go` / `custom` / ...).
    /// Drives which built-in model list the UI offers.
    pub provider: String,
    pub base_url: String,
    /// Never sent back to the webview; `has_api_key` reports presence.
    pub api_key: String,
    pub model_name: String,
    /// Headers the provider requires beyond Authorization.
    ///
    /// OpenCode Go rejects requests without `x-opencode-session`, and its
    /// documentation requires one to be supplied, so this is not optional
    /// decoration — it is part of the protocol.
    #[serde(default)]
    pub extra_headers: Vec<(String, String)>,
}

impl Default for LlmProfile {
    fn default() -> Self {
        Self {
            id: "deepseek".to_string(),
            label: "DeepSeek".to_string(),
            provider: "deepseek".to_string(),
            base_url: "https://api.deepseek.com".to_string(),
            api_key: String::new(),
            model_name: "deepseek-flash".to_string(),
            extra_headers: Vec::new(),
        }
    }
}

impl LlmProfile {
    pub fn has_key(&self) -> bool {
        !self.api_key.trim().is_empty()
    }

    /// Whether this profile can actually serve a request.
    ///
    /// Every mandatory field must be present. A local Ollama endpoint needs no
    /// credential, so requiring a key would wrongly mark the one offline
    /// provider as unusable.
    pub fn is_usable(&self) -> bool {
        if self.base_url.trim().is_empty() || self.model_name.trim().is_empty() {
            return false;
        }
        self.is_keyless() || self.has_key()
    }

    fn is_keyless(&self) -> bool {
        let base = self.base_url.to_lowercase();
        base.contains("localhost") || base.contains("127.0.0.1") || base.contains("11434")
    }

    /// Normalize and fill gaps.
    ///
    /// A header whose value is blank is dropped rather than sent as an empty
    /// string — the provider would answer 401, which reads exactly like a bad
    /// key and sends the user hunting in the wrong place.
    pub fn normalized(mut self) -> Self {
        self.id = self.id.trim().to_string();
        if self.id.is_empty() {
            self.id = "custom".to_string();
        }
        self.label = self.label.trim().to_string();
        if self.label.is_empty() {
            self.label = self.id.clone();
        }
        self.provider = self.provider.trim().to_string();
        if self.provider.is_empty() {
            self.provider = "custom".to_string();
        }
        self.base_url = self.base_url.trim().trim_end_matches('/').to_string();
        self.model_name = self.model_name.trim().to_string();
        self.api_key = self.api_key.trim().to_string();
        self.extra_headers = self
            .extra_headers
            .into_iter()
            .map(|(n, v)| (n.trim().to_string(), v.trim().to_string()))
            .filter(|(n, v)| !n.is_empty() && !v.is_empty())
            .collect();
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_drops_blank_headers() {
        let p = LlmProfile {
            base_url: "https://api.deepseek.com/".into(),
            api_key: "  sk-abc  ".into(),
            extra_headers: vec![
                ("X-OpenCode-Session".into(), " session-1 ".into()),
                ("X-Empty".into(), "   ".into()),
            ],
            ..Default::default()
        }
        .normalized();

        assert_eq!(p.base_url, "https://api.deepseek.com");
        assert_eq!(p.api_key, "sk-abc", "credentials are trimmed");
        assert_eq!(
            p.extra_headers.len(),
            1,
            "a blank header is dropped rather than sent as an empty string"
        );
        assert_eq!(p.extra_headers[0].1, "session-1", "header values are trimmed");
    }

    /// A profile with no key cannot serve a request — except on a loopback
    /// endpoint, where Ollama needs no credential at all.
    #[test]
    fn usability_accounts_for_keyless_local_endpoints() {
        let remote = LlmProfile {
            base_url: "https://api.deepseek.com".into(),
            api_key: String::new(),
            ..Default::default()
        };
        assert!(!remote.is_usable());

        let local = LlmProfile {
            base_url: "http://localhost:11434/v1".into(),
            api_key: String::new(),
            ..Default::default()
        };
        assert!(local.is_usable(), "local Ollama needs no API key");
    }

    /// A half-filled custom profile must not look ready.
    #[test]
    fn incomplete_profiles_are_not_usable() {
        let no_model = LlmProfile {
            base_url: "https://api.deepseek.com".into(),
            api_key: "sk-x".into(),
            model_name: String::new(),
            ..Default::default()
        };
        assert!(!no_model.is_usable());
    }
}