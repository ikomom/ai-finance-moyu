//! Tests for `config.rs`, kept in a sibling file so the module itself stays
//! inside the 300-line budget (AGENTS.md §11). Same pattern as
//! `trend_engine::tests`.

use super::*;
use crate::agent::profile::LlmProfile;

fn profile(id: &str, base: &str, model: &str, key: &str) -> LlmProfile {
    LlmProfile {
        id: id.into(),
        label: id.into(),
        provider: "custom".into(),
        base_url: base.into(),
        api_key: key.into(),
        model_name: model.into(),
        extra_headers: Vec::new(),
    }
}

#[test]
fn flat_pre_profiles_config_still_parses() {
    // A file written before profiles existed has flat fields. It must load
    // rather than failing the command and blanking the whole AI subsystem.
    let legacy = r#"{
        "base_url": "https://api.deepseek.com",
        "api_key": "sk-test",
        "model": "deepseek-flash",
        "enable_search": false
    }"#;

    let cfg: LlmConfig = serde_json::from_str(legacy).expect("legacy config must parse");
    assert_eq!(cfg.max_tokens, 4096, "missing numeric fields get defaults");
    assert!(
        cfg.profiles.iter().all(|p| p.api_key.is_empty()),
        "flat fields are not auto-migrated; migration happens on save"
    );
}

#[test]
fn flat_config_is_migrated_preserving_the_stored_key() {
    // Silently dropping the key would downgrade every existing user to the
    // local rule engine without telling them.
    let cfg = LlmConfig {
        profiles: vec![LlmProfile {
            id: "deepseek".into(),
            label: "DeepSeek".into(),
            provider: "deepseek".into(),
            base_url: "https://api.deepseek.com".into(),
            api_key: "sk-test".into(),
            model_name: "deepseek-flash".into(),
            extra_headers: Vec::new(),
        }],
        active_profile_id: "deepseek".into(),
        ..Default::default()
    }
    .with_derived_flags();

    assert!(cfg.has_key(), "the stored key must survive the shape change");
    assert_eq!(cfg.transport_view().model_name, "deepseek-flash");
}

#[test]
fn active_profile_selects_the_whole_chain() {
    let cfg = LlmConfig {
        profiles: vec![
            profile("ds", "https://api.deepseek.com", "deepseek-flash", "sk-ds"),
            profile("zen", "https://opencode.ai/zen/go/v1", "kimi-k2.6", "sk-zen"),
        ],
        active_profile_id: "zen".into(),
        ..Default::default()
    }
    .with_derived_flags();

    let view = cfg.transport_view();
    assert_eq!(view.base_url, "https://opencode.ai/zen/go/v1");
    assert_eq!(view.model_name, "kimi-k2.6");
    assert_eq!(view.api_key, "sk-zen");
}

#[test]
fn dangling_active_id_falls_back_to_first_profile() {
    // A profile deleted in the UI must not leave the agent model-less.
    let cfg = LlmConfig {
        profiles: vec![profile("only", "https://api.deepseek.com", "deepseek-flash", "sk-x")],
        active_profile_id: "deleted-provider".into(),
        ..Default::default()
    }
    .with_derived_flags();

    assert_eq!(cfg.transport_view().model_name, "deepseek-flash");
}

#[test]
fn detects_reasoning_on_the_v4_naming() {
    // The regression: after the `deepseek-chat` / `-reasoner` retirement the
    // old `contains("reasoner")` test stopped matching, and the reasoning-trace
    // workaround silently stopped applying.
    for id in ["deepseek-flash", "deepseek-v4-pro", "deepseek-v4-flash"] {
        let cfg = LlmConfig {
            profiles: vec![profile("ds", "https://api.deepseek.com", id, "sk-x")],
            ..Default::default()
        }
        .with_derived_flags();
        assert!(cfg.is_deepseek_reasoner, "`{id}` must be treated as a reasoning model");
    }
}

#[test]
fn reasoning_flag_requires_a_deepseek_endpoint() {
    // Otherwise a local Ollama serving `qwen3-flash` gets DeepSeek handling.
    let cfg = LlmConfig {
        profiles: vec![profile("local", "http://localhost:11434/v1", "qwen3-flash", "")],
        ..Default::default()
    }
    .with_derived_flags();
    assert!(!cfg.is_deepseek_reasoner);
}

#[test]
fn native_search_is_only_derived_for_providers_that_have_it() {
    // `enable_search` is a hard 400 everywhere else.
    for (base, expected) in [
        ("https://dashscope.aliyuncs.com/compatible-mode/v1", true),
        ("https://api.moonshot.ai/v1", true),
        ("https://api.deepseek.com", false),
        ("https://api.openai.com/v1", false),
        ("http://localhost:11434/v1", false),
        // OpenCode Go aggregates other vendors but exposes no search channel.
        ("https://opencode.ai/zen/go/v1", false),
    ] {
        let cfg = LlmConfig {
            profiles: vec![profile("p", base, "m", "sk-x")],
            ..Default::default()
        }
        .with_derived_flags();
        assert_eq!(cfg.supports_native_search, expected, "base `{base}`");
    }
}

#[test]
fn gpt6_is_flagged_as_rejecting_sampling_params() {
    for id in ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-luna"] {
        let cfg = LlmConfig {
            profiles: vec![profile("oai", "https://api.openai.com/v1", id, "sk-x")],
            temperature: 0.6,
            ..Default::default()
        }
        .with_derived_flags();
        assert!(cfg.rejects_sampling_params, "`{id}` must not receive a temperature");
    }

    let older = LlmConfig {
        profiles: vec![profile("oai", "https://api.openai.com/v1", "gpt-4o", "sk-x")],
        ..Default::default()
    }
    .with_derived_flags();
    assert!(!older.rejects_sampling_params, "pre-GPT-6 still accepts temperature");
}

#[test]
fn sampling_restriction_requires_an_openai_endpoint() {
    let cfg = LlmConfig {
        profiles: vec![profile("local", "http://localhost:11434/v1", "gpt-oss:20b", "")],
        ..Default::default()
    }
    .with_derived_flags();
    assert!(!cfg.rejects_sampling_params);
}

#[test]
fn clamps_sampling_parameters() {
    let cfg = LlmConfig {
        temperature: 99.0,
        max_tokens: 0,
        ..Default::default()
    }
    .with_derived_flags();
    assert_eq!(cfg.temperature, 2.0);
    assert_eq!(cfg.max_tokens, 1);
}

#[test]
fn extra_headers_reach_the_transport_view() {
    // OpenCode Go rejects requests without `x-opencode-session`.
    let mut p = profile("zen", "https://opencode.ai/zen/go/v1", "kimi-k2.6", "sk-zen");
    p.extra_headers = vec![("x-opencode-session".into(), "abc-123".into())];

    let cfg = LlmConfig {
        profiles: vec![p],
        ..Default::default()
    }
    .with_derived_flags();

    let view = cfg.transport_view();
    assert_eq!(view.extra_headers.len(), 1);
    assert_eq!(view.extra_headers[0].0, "x-opencode-session");
}