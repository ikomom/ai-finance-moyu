//! Data types for Jev / Laya (System-1) AI Decision Engine.

use serde::{Deserialize, Serialize};

pub use crate::config::{AiDecisionConfig, AiDecisionMode};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDownloadProgress {
    pub model_id: String,
    pub status: String, // "downloading" | "completed" | "cancelled" | "error"
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalServiceStatus {
    pub running: bool,
    pub port: u16,
    pub pid: Option<u32>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockDecisionPayload {
    pub code: String,
    pub name: String,
    pub price: f64,
    pub change_pct: f64,
    pub vwap_bias: f64,
    pub active_buy_ratio: Option<f64>,
    pub bid_ask_imbalance: Option<f64>,
    pub spatial_desc: String,
    pub sector_desc: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub daily_ma_desc: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub daily_kdj_desc: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub daily_levels_desc: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sector_style: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub support_dist_pct: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resist_dist_pct: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ma20_dist_pct: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wave_trend: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub market_scissors_pct: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockDecisionResult {
    pub code: String,
    pub mode: String, // "local" | "online" | "disabled" | "offline"
    pub is_fake_pump: f64, // 0.0 ~ 1.0 (诱多嫌疑概率)
    pub is_fake_pump_label: String, // 如 "21% (正常买盘)" 或 "84% (🚨高度警惕诱多)"
    pub action: String, // "take_profit" | "hold" | "wait" | "stop_loss" | "buy"
    pub action_label: String, // "【顺势做多】" | "【逢高止盈】" 等
    pub action_confidence: f64, // 0.0 ~ 1.0
    pub attribution: String, // "market_drag" | "sector_sync" | "solo_diverge"
    pub attribution_label: String, // 如 "受大盘弱势拖累" | "板块主线共振推升" | "个股独立游资博弈"
    pub latency_ms: u64,
    pub model_name: String,
    pub raw_summary: String,
}
