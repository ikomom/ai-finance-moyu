//! Persistence and IPC for provider profiles.
//!
//! Extracted from `commands/agent.rs` so both stay inside the 300-line budget
//! (AGENTS.md §11).

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::agent::{LlmConfig, LlmProfile};

pub fn agent_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = crate::config::config_dir(app)?;
    Ok(dir.join("agent_config.json"))
}

/// A `agent_config.json` written before profiles existed.
#[derive(serde::Deserialize)]
struct LegacyAgentConfig {
    #[serde(default)]
    provider: String,
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    api_key: String,
    /// The pre-profiles struct spelled this `model`, and real config files on
    /// disk still use that key. Without the alias the migration reads an empty
    /// string and the user's model silently reverts to the default.
    #[serde(default, alias = "model")]
    model_name: String,
    #[serde(default)]
    enable_search: bool,
    #[serde(default)]
    temperature: f64,
    #[serde(default)]
    max_tokens: u32,
}

/// Fold a pre-profiles config into a single-entry profile list.
///
/// Without this every existing install would come back with no credential and
/// quietly drop to the local rule engine — an invisible failure, because the
/// app still answers.
fn migrate_legacy(raw: &str) -> Option<LlmConfig> {
    let legacy: LegacyAgentConfig = serde_json::from_str(raw).ok()?;
    // An all-empty file is just a fresh install, not legacy data.
    if legacy.base_url.trim().is_empty() && legacy.api_key.trim().is_empty() {
        return None;
    }

    let provider = match legacy.provider.trim() {
        "" => "custom".to_string(),
        p => p.to_string(),
    };

    Some(
        LlmConfig {
            profiles: vec![LlmProfile {
                id: provider.clone(),
                label: provider.clone(),
                provider,
                base_url: legacy.base_url,
                api_key: legacy.api_key,
                model_name: legacy.model_name,
                extra_headers: Vec::new(),
            }],
            active_profile_id: legacy.provider.trim().to_string(),
            enable_search: legacy.enable_search,
            temperature: legacy.temperature,
            max_tokens: legacy.max_tokens,
            ..Default::default()
        }
        .with_derived_flags(),
    )
}

/// Read the persisted provider config, falling back to sane defaults.
///
/// This is the **only** place an API key leaves the config file; every value
/// returned to the webview goes through [`to_view`], which strips it.
pub fn load(app: &AppHandle) -> LlmConfig {
    let Ok(path) = agent_config_path(app) else {
        return LlmConfig::default();
    };
    let Ok(content) = fs::read_to_string(&path) else {
        return LlmConfig::default();
    };

    // Try the current shape first; only fall back to migration when it yields
    // no profile holding a key, so a valid-but-empty file is not misread as
    // legacy data and overwritten.
    if let Ok(mut cfg) = serde_json::from_str::<LlmConfig>(&content) {
        if cfg.profiles.is_empty() {
            cfg.profiles = vec![LlmProfile::default()];
        }
        if cfg.profiles.iter().all(|p| p.api_key.trim().is_empty()) {
            if let Some(migrated) = migrate_legacy(&content) {
                log::info!(target: "SYSTEM", "已迁移旧版 agent_config.json 为多服务商档案");
                return migrated;
            }
        }
        return cfg.with_derived_flags();
    }

    match migrate_legacy(&content) {
        Some(cfg) => cfg,
        None => {
            log::warn!(target: "SYSTEM", "agent_config.json 解析失败，回退默认配置");
            LlmConfig::default()
        }
    }
}

/// Write atomically: temp file, fsync, rename.
fn persist(app: &AppHandle, cfg: &LlmConfig) -> Result<(), String> {
    let path = agent_config_path(app)?;
    let content = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
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
    fs::rename(&tmp_path, &path).map_err(|e| e.to_string())
}

/// A profile as the settings UI sees it: no secret, plus whether one is stored.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    #[serde(flatten)]
    pub profile: LlmProfile,
    pub has_api_key: bool,
}

/// What the settings UI receives: every profile with its key stripped.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfigView {
    pub profiles: Vec<ProfileView>,
    pub active_profile_id: String,
    pub has_api_key: bool,
    pub enable_search: bool,
    pub temperature: f64,
    pub max_tokens: u32,
}

/// Strip secrets from every profile so the webview never receives one.
pub fn to_view(cfg: &LlmConfig) -> AgentConfigView {
    AgentConfigView {
        profiles: cfg
            .profiles
            .iter()
            .map(|p| {
                let mut clone = p.clone();
                clone.api_key.clear();
                ProfileView {
                    has_api_key: p.has_key(),
                    profile: clone,
                }
            })
            .collect(),
        active_profile_id: cfg.active_profile_id.clone(),
        has_api_key: cfg.has_key(),
        enable_search: cfg.enable_search,
        temperature: cfg.temperature,
        max_tokens: cfg.max_tokens,
    }
}

/// Sentinel the UI sends to deliberately delete a stored key.
pub const CLEAR_KEY_SENTINEL: &str = "__CLEAR__";

/// Merge the incoming profiles with the stored credentials.
///
/// An empty `api_key` means "keep the stored one" — the UI never receives the
/// secret, so it cannot echo it back. Matching is by profile id rather than by
/// position: matching by index would move a key to a different provider the
/// moment the list is reordered.
pub fn save(app: &AppHandle, mut config: LlmConfig) -> Result<(), String> {
    let existing = load(app);

    for profile in config.profiles.iter_mut() {
        if profile.api_key == CLEAR_KEY_SENTINEL {
            profile.api_key.clear();
        } else if profile.api_key.trim().is_empty() {
            profile.api_key = existing
                .profiles
                .iter()
                .find(|p| p.id == profile.id)
                .map(|p| p.api_key.clone())
                .unwrap_or_default();
        }
    }

    persist(app, &config.with_derived_flags())
}

/// Switch the active profile without opening the settings window.
///
/// Refuses an id that is not configured or cannot serve a request, so a stale
/// UI can never point the agent at an endpoint with no credential — that would
/// silently fall back to the local rule engine and look like the model chose to
/// answer from a script.
pub fn activate(app: &AppHandle, profile_id: &str) -> Result<AgentConfigView, String> {
    let mut cfg = load(app);

    let profile = cfg
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| format!("未找到模型配置: {profile_id}"))?;

    if !profile.is_usable() {
        return Err(format!(
            "「{}」尚未完成配置，无法启用。请先在设置中填写接口地址、模型标识与 API Key。",
            profile.label
        ));
    }

    cfg.active_profile_id = profile_id.to_string();
    let cfg = cfg.with_derived_flags();
    persist(app, &cfg)?;
    Ok(to_view(&cfg))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_flat_config_becomes_one_profile_with_its_key() {
        let raw = r#"{
            "base_url": "https://api.deepseek.com",
            "api_key": "sk-legacy",
            "model": "deepseek-flash",
            "provider": "deepseek",
            "enable_search": false,
            "temperature": 0.6,
            "max_tokens": 4096
        }"#;

        let cfg = migrate_legacy(raw).expect("legacy config must migrate");
        assert_eq!(cfg.profiles.len(), 1);
        assert_eq!(cfg.active_profile_id, "deepseek");
        assert!(cfg.has_key(), "the stored key must not be dropped");
        assert_eq!(cfg.transport_view().model_name, "deepseek-flash");
    }

    #[test]
    fn empty_file_is_not_mistaken_for_legacy_data() {
        let raw = r#"{"base_url":"","api_key":"","enable_search":false}"#;
        assert!(migrate_legacy(raw).is_none());
    }

    #[test]
    fn custom_provider_without_an_id_still_gets_one() {
        let raw = r#"{
            "base_url": "https://gateway.example.com/v1",
            "api_key": "sk-x",
            "model": "some-model"
        }"#;

        let cfg = migrate_legacy(raw).expect("must migrate");
        let p = cfg.active_profile().expect("an active profile");
        assert_eq!(p.id, "custom");
        assert_eq!(p.label, "custom");
        assert_eq!(p.base_url, "https://gateway.example.com/v1");
    }

    /// The regression this alias exists for: config files written by the flat
    /// schema spell the field `model`. Parsing it as `model_name` only yields
    /// an empty string, and the user's chosen model silently resets — the app
    /// still works, just against a model they did not pick.
    #[test]
    fn legacy_model_key_alias_is_honoured() {
        let raw = r#"{
            "base_url": "https://opencode.ai/zen/go/v1",
            "api_key": "sk-zen",
            "model": "kimi-k2.6",
            "provider": "opencode_go"
        }"#;

        let cfg = migrate_legacy(raw).expect("must migrate");
        assert_eq!(
            cfg.transport_view().model_name,
            "kimi-k2.6",
            "the pre-profiles `model` key must survive migration"
        );
        assert_eq!(cfg.active_profile_id, "opencode_go");
        assert!(cfg.has_key());
    }
}