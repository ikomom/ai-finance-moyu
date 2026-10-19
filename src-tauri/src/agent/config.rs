//! LLM provider configuration shared by the transport and the commands layer.
//!
//! Split out of `client.rs` so the HTTP/SSE code stays focused and every file
//! stays inside the 300-line budget (AGENTS.md §11).

use serde::{Deserialize, Serialize};

use super::profile::LlmProfile;

/// Wire shape shared with the settings UI (`src/types/agent.ts`).
///
/// Field names are deliberately **snake_case**, matching the TypeScript
/// interface verbatim. An earlier version renamed them on this side only, so
/// every save failed with `missing field 'model'` and the whole AI subsystem
/// silently fell back to the local heuristic. `#[serde(default)]` means a
/// partially written config file still loads instead of failing the command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LlmConfig {
    /// Every configured provider. Owns its own key and endpoint.
    pub profiles: Vec<LlmProfile>,
    /// Id of the profile used for the next request. Must match one entry in
    /// `profiles`; resolved through [`LlmConfig::active_profile`].
    pub active_profile_id: String,
    pub enable_search: bool,
    pub temperature: f64,
    pub max_tokens: u32,
    /// Derived server-side from the active profile; never trusted from the client.
    pub is_deepseek_reasoner: bool,
    /// Derived server-side from the active profile; never trusted from the client.
    pub is_moonshot: bool,
    /// True when the active model exposes a native web-search channel.
    pub supports_native_search: bool,
    /// True when the provider rejects `temperature` / `top_p` outright.
    pub rejects_sampling_params: bool,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            profiles: vec![LlmProfile::default()],
            active_profile_id: "deepseek".to_string(),
            enable_search: false,
            temperature: 0.6,
            max_tokens: 4096,
            is_deepseek_reasoner: false,
            is_moonshot: false,
            supports_native_search: false,
            rejects_sampling_params: false,
        }
    }
}

impl LlmConfig {
    /// The profile the next request will use.
    ///
    /// Falls back to the first entry when the id does not match — a dangling
    /// `active_profile_id` must not leave the whole AI subsystem unable to
    /// pick a model.
    pub fn active_profile(&self) -> Option<&LlmProfile> {
        self.profiles
            .iter()
            .find(|p| p.id == self.active_profile_id)
            .or_else(|| self.profiles.first())
    }

    /// Credential of the profile that will actually be called.
    pub fn has_key(&self) -> bool {
        self.active_profile().map(|p| p.has_key()).unwrap_or(false)
    }

    /// Recompute every transport flag from the active profile.
    ///
    /// Runs on load and on save so a stale file can never mislabel a provider.
    pub fn with_derived_flags(mut self) -> Self {
        self.temperature = if self.temperature.is_finite() {
            self.temperature.clamp(0.0, 2.0)
        } else {
            LlmConfig::default().temperature
        };
        self.max_tokens = self.max_tokens.clamp(1, 32_768);

        self.profiles = self.profiles.into_iter().map(|p| p.normalized()).collect();

        let (reasoner, moonshot, search, sampling) = self
            .active_profile()
            .map(|p| {
                let model = p.model_name.to_lowercase();
                let lower = p.base_url.to_lowercase();

                // DeepSeek retired `deepseek-chat` / `deepseek-reasoner` on
                // 2026-07-24; the V4 generation is `deepseek-flash` and
                // `deepseek-v4-pro`. Both expose a reasoning trace on
                // tool-calling turns, so the old `contains("reasoner")` test
                // stopped matching and the wire-sanitizing workaround silently
                // stopped applying. Match the family, not the retired alias.
                let reasoner = lower.contains("deepseek")
                    && (model.contains("flash")
                        || model.contains("v4")
                        || model.contains("reasoner")
                        || model.contains("r1"));

                let moonshot = lower.contains("moonshot");

                // `enable_search` is a 400 on providers without that channel,
                // not a no-op, so this gates the flag.
                let search = (lower.contains("dashscope")
                    || lower.contains("aliyuncs")
                    || moonshot)
                    && !lower.contains("11434");

                // The GPT-6 generation dropped the sampling parameters: sending
                // one is not "ignored", OpenAI answers 400 and the call dies.
                let sampling = lower.contains("openai.com") && model.starts_with("gpt-6");

                (reasoner, moonshot, search, sampling)
            })
            .unwrap_or((false, false, false, false));

        self.is_deepseek_reasoner = reasoner;
        self.is_moonshot = moonshot;
        self.supports_native_search = search;
        self.rejects_sampling_params = sampling;
        self
    }

    /// Flatten the active profile into the shape the transport layer consumes.
    ///
    /// `client.rs` and `health.rs` only care about one endpoint at a time, so
    /// rather than thread the profile list through them they receive this
    /// projection.
    pub fn transport_view(&self) -> TransportConfig {
        let p = self.active_profile();
        TransportConfig {
            base_url: p.map(|p| p.base_url.clone()).unwrap_or_default(),
            model_name: p.map(|p| p.model_name.clone()).unwrap_or_default(),
            api_key: p.map(|p| p.api_key.clone()).unwrap_or_default(),
            extra_headers: p.map(|p| p.extra_headers.clone()).unwrap_or_default(),
            is_deepseek_reasoner: self.is_deepseek_reasoner,
            is_moonshot: self.is_moonshot,
            enable_search: self.enable_search,
            supports_native_search: self.supports_native_search,
            rejects_sampling_params: self.rejects_sampling_params,
            temperature: self.temperature,
            max_tokens: self.max_tokens,
        }
    }
}

/// The single-endpoint view consumed by the HTTP layer.
#[derive(Debug, Clone)]
pub struct TransportConfig {
    pub base_url: String,
    pub model_name: String,
    pub api_key: String,
    pub extra_headers: Vec<(String, String)>,
    pub is_deepseek_reasoner: bool,
    pub is_moonshot: bool,
    pub enable_search: bool,
    pub supports_native_search: bool,
    pub rejects_sampling_params: bool,
    pub temperature: f64,
    pub max_tokens: u32,
}

impl TransportConfig {
    pub fn has_key(&self) -> bool {
        !self.api_key.trim().is_empty()
    }
}


#[cfg(test)]
mod tests;
