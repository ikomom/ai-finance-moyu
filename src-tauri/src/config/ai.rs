//! Configuration for Jev / Laya (System-1) AI Decision Engine.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub enum AiDecisionMode {
    #[default]
    Disabled,
    Local,
    Online,
}

pub fn default_local_port() -> u16 {
    9999
}

pub fn default_local_model_id() -> String {
    "convaiinnovations/laya-multilingual".into()
}

pub fn default_online_endpoint() -> Option<String> {
    Some("https://openrouter.ai/api/alpha/decisions".into())
}

pub fn default_online_model() -> String {
    "typesafe/jev-1.13".into()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDecisionConfig {
    #[serde(default)]
    pub mode: AiDecisionMode,
    #[serde(default = "default_local_port")]
    pub local_port: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub models_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_script_path: Option<String>,
    #[serde(default = "default_local_model_id")]
    pub local_model_id: String,
    #[serde(default = "default_online_endpoint", skip_serializing_if = "Option::is_none")]
    pub online_endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub online_api_key: Option<String>,
    #[serde(default = "default_online_model")]
    pub online_model: String,
}

impl Default for AiDecisionConfig {
    fn default() -> Self {
        Self {
            mode: AiDecisionMode::Disabled,
            local_port: default_local_port(),
            models_dir: None,
            local_script_path: None,
            local_model_id: default_local_model_id(),
            online_endpoint: default_online_endpoint(),
            online_api_key: None,
            online_model: default_online_model(),
        }
    }
}
