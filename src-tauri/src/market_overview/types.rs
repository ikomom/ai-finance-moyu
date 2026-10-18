//! Core data structures representing market indices, sectors, and cross-market linkage.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketIndex {
    pub code: String,
    pub name: String,
    pub price: f64,
    pub change: f64,
    pub change_pct: f64,
    pub turnover: f64, // 成交额 (元)
    pub up_count: u32,
    pub down_count: u32,
    pub flat_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectorItem {
    pub code: String,
    pub name: String,
    pub change_pct: f64,
    pub up_count: u32,
    pub down_count: u32,
    pub lead_stock_name: String,
    #[serde(default)]
    pub lead_stock_code: String,
    #[serde(default)]
    pub lead_stock_zdf: f64,
}

/// Sector and market beta linkage analysis for an individual stock.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SectorLinkage {
    pub sector_code: String,
    pub sector_name: String,
    pub sector_change_pct: f64,
    /// 相对行业板块超额收益: R_stock - R_sector (%)
    pub delta_r_sector: f64,
    /// 相对大盘指数超额收益: R_stock - R_market (%)
    pub delta_r_market: f64,
    pub leader_code: String,
    pub leader_name: String,
    pub leader_change_pct: f64,
    /// 角色定位: "板块领涨核心" | "梯队协同助攻" | "逆势抗跌核心" | "脱离板块补跌" | "跟随板块整理"
    pub role: String,
    /// 盘面微观评述
    pub diagnosis: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MarketOverview {
    pub indices: Vec<MarketIndex>,
    pub up_count: u32,
    pub down_count: u32,
    pub flat_count: u32,
    pub total_turnover: f64, // 两市总成交额 (元)
    pub turnover_change_pct: Option<f64>, // 两市成交额环比变动率 (%)
    pub turnover_change_amount: Option<f64>, // 两市成交额较昨日增减 (元)
    pub north_net_flow: Option<f64>, // 北向资金净流入 (元)
    pub top_sectors: Vec<SectorItem>,
    pub updated_at: String,
    #[serde(default)]
    pub global_indices: Vec<MarketIndex>,
}
