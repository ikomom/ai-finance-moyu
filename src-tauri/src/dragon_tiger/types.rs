//! Dragon & Tiger List (龙虎榜) types.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DragonTigerSeat {
    pub branch_name: String,
    pub trader_label: Option<String>,
    pub buy_amount: f64,
    pub sell_amount: f64,
    pub net_amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockDragonTiger {
    pub code: String,
    pub name: String,
    pub trade_date: String,
    pub reason: String,
    pub close_price: f64,
    pub change_pct: f64,
    pub net_total: f64,
    pub institution_buy: f64,
    pub institution_sell: f64,
    pub institution_net: f64,
    pub top_buyers: Vec<DragonTigerSeat>,
    pub top_sellers: Vec<DragonTigerSeat>,
}

/// Simplified detail: only dragon tiger seats, no sentiment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockDetailInfo {
    pub code: String,
    pub dragon_tiger: Option<StockDragonTiger>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketLhbStockItem {
    pub code: String,
    pub name: String,
    pub price: f64,
    pub change_pct: f64,
    pub institution_net: f64,
    pub net_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FamousTraderMove {
    pub trader_name: String,
    pub stock_code: String,
    pub stock_name: String,
    pub action: String,
    pub net_amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketDragonTigerOverview {
    pub trade_date: String,
    pub top_institution_stocks: Vec<MarketLhbStockItem>,
    pub famous_trader_moves: Vec<FamousTraderMove>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeatOperationItem {
    pub code: String,
    pub name: String,
    pub trade_date: String,
    pub buy_amount: f64,
    pub sell_amount: f64,
    pub net_amount: f64,
    pub close_price: f64,
    pub change_pct: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeatDetailInfo {
    pub branch_name: String,
    pub trader_label: Option<String>,
    pub same_day_operations: Vec<SeatOperationItem>,
    pub historical_operations: Vec<SeatOperationItem>,
}
