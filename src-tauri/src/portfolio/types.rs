//! Portfolio, broker accounts, positions, and simulated trade records types.

use serde::{Deserialize, Serialize};

/// Asset class classification for fee computation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssetClass {
    Stock,
    Etf,
    ConvertibleBond,
}

impl AssetClass {
    /// Classify by canonical A-share code (e.g. "sh600000", "sz159915", "sh510300", "sh113009").
    pub fn from_code(code: &str) -> Self {
        let clean = code.trim().to_ascii_lowercase();
        let num_part = clean.trim_start_matches(|c: char| c.is_alphabetic());

        if num_part.starts_with("51")
            || num_part.starts_with("56")
            || num_part.starts_with("58")
            || num_part.starts_with("15")
            || num_part.starts_with("16")
            || num_part.starts_with("50")
        {
            AssetClass::Etf
        } else if num_part.starts_with("11") || num_part.starts_with("12") {
            AssetClass::ConvertibleBond
        } else {
            AssetClass::Stock
        }
    }
}

/// Detailed fee configuration per broker account.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerFeeConfig {
    pub preset: String,
    pub stock_rate: f64,
    pub stock_min_fee: f64,
    pub etf_rate: f64,
    pub etf_min_fee: f64,
    pub bond_rate: f64,
    #[serde(default)]
    pub bond_min_fee: f64,
    pub stamp_duty_rate: f64,
}

impl BrokerFeeConfig {
    pub fn preset(name: &str) -> Self {
        match name {
            "vip_low" => Self {
                preset: "vip_low".into(), stock_rate: 0.0000954, stock_min_fee: 0.5,
                etf_rate: 0.00005, etf_min_fee: 0.25, bond_rate: 0.00005, bond_min_fee: 0.5, stamp_duty_rate: 0.0005,
            },
            "preferential" => Self {
                preset: "preferential".into(), stock_rate: 0.0001, stock_min_fee: 0.0,
                etf_rate: 0.00005, etf_min_fee: 0.0, bond_rate: 0.00005, bond_min_fee: 0.5, stamp_duty_rate: 0.0005,
            },
            "standard" => Self {
                preset: "standard".into(), stock_rate: 0.00025, stock_min_fee: 5.0,
                etf_rate: 0.0001, etf_min_fee: 5.0, bond_rate: 0.0001, bond_min_fee: 1.0, stamp_duty_rate: 0.0005,
            },
            "zero" => Self {
                preset: "zero".into(), stock_rate: 0.0, stock_min_fee: 0.0,
                etf_rate: 0.0, etf_min_fee: 0.0, bond_rate: 0.0, bond_min_fee: 0.0, stamp_duty_rate: 0.0,
            },
            _ => Self::preset("vip_low"),
        }
    }
}

impl Default for BrokerFeeConfig {
    fn default() -> Self {
        Self::preset("vip_low")
    }
}

/// Individual broker sub-account.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerAccount {
    pub id: String,
    pub name: String,
    pub initial_cash: f64,
    pub available_cash: f64,
    pub fee_config: BrokerFeeConfig,
    pub created_at: String,
}

impl BrokerAccount {
    pub fn new(id: impl Into<String>, name: impl Into<String>, initial_cash: f64) -> Self {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        Self {
            id: id.into(),
            name: name.into(),
            initial_cash,
            available_cash: initial_cash,
            fee_config: BrokerFeeConfig::default(),
            created_at: now,
        }
    }
}

/// Simulated holding position.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioPosition {
    pub broker_id: String,
    pub code: String,
    pub name: String,
    pub shares: u32,
    pub cost_price: f64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum TradeAction {
    #[serde(alias = "buy")]
    Buy,
    #[serde(alias = "sell")]
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum TradeRecordStatus {
    Filled,
    Pending,
    Cancelled,
    Expired,
}

fn default_trade_status() -> TradeRecordStatus {
    TradeRecordStatus::Filled
}

/// Permanent ledger transaction record.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeRecord {
    pub id: String,
    pub broker_id: String,
    pub broker_name: String,
    pub code: String,
    pub name: String,
    pub action: TradeAction,
    pub price: f64,
    pub shares: u32,
    pub amount: f64,
    pub fee: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub realized_pnl: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub realized_pct: Option<f64>,
    pub timestamp: String,
    #[serde(default = "default_trade_status")]
    pub status: TradeRecordStatus,
}

/// Active pending limit order waiting for price matching.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingOrder {
    pub id: String,
    pub broker_id: String,
    pub broker_name: String,
    pub code: String,
    pub name: String,
    pub action: TradeAction,
    pub price: f64,
    pub shares: u32,
    pub frozen_cash: f64,
    pub created_at: String,
}

/// Result of submitting a simulated order.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum OrderExecutionStatus {
    Filled { record: TradeRecord },
    Pending { order: PendingOrder },
}

/// Input payload for executing a trade.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeOrder {
    pub broker_id: String,
    pub code: String,
    pub name: Option<String>,
    pub action: TradeAction,
    pub price: f64,
    pub shares: u32,
    #[serde(default)]
    pub pre_close: Option<f64>,
    #[serde(default)]
    pub bids: Option<Vec<(f64, f64)>>,
    #[serde(default)]
    pub asks: Option<Vec<(f64, f64)>>,
    #[serde(default)]
    pub order_id: Option<String>,
}

fn default_strict_mode() -> bool {
    true
}

pub const PORTFOLIO_SCHEMA_VERSION: u32 = 1;

fn default_portfolio_schema_version() -> u32 {
    PORTFOLIO_SCHEMA_VERSION
}

/// Root persisted schema stored in `portfolio.json`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PortfolioData {
    pub active_broker_id: Option<String>,
    pub brokers: Vec<BrokerAccount>,
    pub positions: Vec<PortfolioPosition>,
    pub trades: Vec<TradeRecord>,
    #[serde(default)]
    pub pending_orders: Vec<PendingOrder>,
    #[serde(default = "default_strict_mode")]
    pub strict_mode: bool,
    #[serde(default = "default_portfolio_schema_version")]
    pub schema_version: u32,
}

impl Default for PortfolioData {
    fn default() -> Self {
        Self {
            active_broker_id: None,
            brokers: Vec::new(),
            positions: Vec::new(),
            trades: Vec::new(),
            pending_orders: Vec::new(),
            strict_mode: true,
            schema_version: PORTFOLIO_SCHEMA_VERSION,
        }
    }
}

/// Position enriched with real-time market data for display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionView {
    pub broker_id: String,
    pub broker_name: String,
    pub code: String,
    pub name: String,
    pub shares: u32,
    pub available_shares: u32,
    pub cost_price: f64,
    pub current_price: f64,
    pub market_value: f64,
    pub floating_pnl: f64,
    pub floating_pnl_pct: f64,
    pub today_pnl: f64,
    pub updated_at: String,
}

/// Complete portfolio dashboard overview.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioSummary {
    pub active_broker_id: Option<String>,
    pub total_equity: f64,
    pub total_market_value: f64,
    pub total_cash: f64,
    pub total_pnl: f64,
    pub total_pnl_pct: f64,
    pub today_pnl: f64,
    pub position_ratio: f64,
    pub brokers: Vec<BrokerAccount>,
    pub positions: Vec<PositionView>,
    pub trades: Vec<TradeRecord>,
    pub pending_orders: Vec<PendingOrder>,
    pub strict_mode: bool,
}

/// Simulated trade submission response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteTradeResult {
    pub summary: PortfolioSummary,
    pub status: String,
    pub message: String,
}
