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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeatRadarItem {
    pub code: String,
    pub name: String,
    pub trade_date: String,
    pub branch_name: String,
    pub trader_label: Option<String>,
    pub is_buy: bool,
    pub buy_amount: f64,
    pub sell_amount: f64,
    pub net_amount: f64,
    pub close_price: f64,
    pub change_pct: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeatRadarResult {
    pub query_date: String,
    pub items: Vec<SeatRadarItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CustomSeatMapping {
    pub id: String,
    pub branch_keyword: String,
    pub label: String,
    #[serde(default = "default_seat_category")]
    pub category: String,
    #[serde(default = "default_seat_enabled")]
    pub enabled: bool,
}

fn default_seat_category() -> String {
    "trader".into()
}

fn default_seat_enabled() -> bool {
    true
}

pub fn default_custom_seats() -> Vec<CustomSeatMapping> {
    vec![
        CustomSeatMapping {
            id: "preset-hjl-1".into(),
            branch_keyword: "北京东城分公司".into(),
            label: "呼家楼".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-hjl-2".into(),
            branch_keyword: "北京呼家楼".into(),
            label: "呼家楼".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-lyl-1".into(),
            branch_keyword: "福州六一中路".into(),
            label: "六一路".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-zmz-1".into(),
            branch_keyword: "上海江苏路".into(),
            label: "章盟主".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-zmz-2".into(),
            branch_keyword: "杭州延安路".into(),
            label: "章盟主".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-fxx-1".into(),
            branch_keyword: "西安朱雀大街".into(),
            label: "方新侠".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-cxq-1".into(),
            branch_keyword: "大连黄河路".into(),
            label: "陈小群".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-gys-1".into(),
            branch_keyword: "上海宛平南路".into(),
            label: "炒股养家".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-gys-2".into(),
            branch_keyword: "上海茅台路".into(),
            label: "炒股养家".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-inst-1".into(),
            branch_keyword: "机构专用".into(),
            label: "机构专用".into(),
            category: "institution".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-north-1".into(),
            branch_keyword: "深股通".into(),
            label: "北向外资".into(),
            category: "north".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-north-2".into(),
            branch_keyword: "沪股通".into(),
            label: "北向外资".into(),
            category: "north".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-lasa-1".into(),
            branch_keyword: "拉萨团结路".into(),
            label: "拉萨天团".into(),
            category: "trader".into(),
            enabled: true,
        },
        CustomSeatMapping {
            id: "preset-lasa-2".into(),
            branch_keyword: "拉萨东环路".into(),
            label: "拉萨天团".into(),
            category: "trader".into(),
            enabled: true,
        },
    ]
}
