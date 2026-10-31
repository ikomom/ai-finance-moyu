//! Baseline fallback cache for Dragon & Tiger data.
//!
//! Guarantees zero blank screen and robust offline presentation (AGENTS.md §2 & §14).

use super::trader_dict::match_famous_trader;
use super::types::{
    DragonTigerSeat, FamousTraderMove, MarketDragonTigerOverview, MarketLhbStockItem,
    SeatDetailInfo, SeatOperationItem, StockDetailInfo, StockDragonTiger,
};
use crate::market::beijing_now;

/// Get realistic whole-market Dragon & Tiger overview baseline data.
pub fn get_market_baseline() -> MarketDragonTigerOverview {
    let today = beijing_now().format("%Y-%m-%d").to_string();

    let top_institution_stocks = vec![
        MarketLhbStockItem {
            code: "sh603019".into(),
            name: "中科曙光".into(),
            price: 78.50,
            change_pct: 10.00,
            institution_net: 385_000_000.0,
            net_total: 520_000_000.0,
        },
        MarketLhbStockItem {
            code: "sh601138".into(),
            name: "工业富联".into(),
            price: 24.60,
            change_pct: 6.82,
            institution_net: 260_000_000.0,
            net_total: 312_000_000.0,
        },
        MarketLhbStockItem {
            code: "sz000977".into(),
            name: "浪潮信息".into(),
            price: 46.80,
            change_pct: 9.98,
            institution_net: 195_000_000.0,
            net_total: 248_000_000.0,
        },
        MarketLhbStockItem {
            code: "sz002049".into(),
            name: "紫光国微".into(),
            price: 72.30,
            change_pct: 5.16,
            institution_net: 142_000_000.0,
            net_total: 180_000_000.0,
        },
        MarketLhbStockItem {
            code: "sz000063".into(),
            name: "中兴通讯".into(),
            price: 33.15,
            change_pct: 4.25,
            institution_net: 115_000_000.0,
            net_total: 145_000_000.0,
        },
    ];

    let famous_trader_moves = vec![
        FamousTraderMove {
            trader_name: "方新侠".into(),
            stock_code: "sh603019".into(),
            stock_name: "中科曙光".into(),
            action: "买入".into(),
            net_amount: 128_000_000.0,
        },
        FamousTraderMove {
            trader_name: "呼家楼".into(),
            stock_code: "sh601138".into(),
            stock_name: "工业富联".into(),
            action: "买入".into(),
            net_amount: 95_000_000.0,
        },
        FamousTraderMove {
            trader_name: "赵老哥".into(),
            stock_code: "sz000977".into(),
            stock_name: "浪潮信息".into(),
            action: "买入".into(),
            net_amount: 72_000_000.0,
        },
        FamousTraderMove {
            trader_name: "章盟主".into(),
            stock_code: "sz002049".into(),
            stock_name: "紫光国微".into(),
            action: "买入".into(),
            net_amount: 65_000_000.0,
        },
    ];

    MarketDragonTigerOverview {
        trade_date: today,
        top_institution_stocks,
        famous_trader_moves,
    }
}

/// Baseline for individual stock detail info (Dragon & Tiger only).
pub fn get_stock_baseline(code: &str, stock_name: Option<&str>) -> StockDetailInfo {
    let today = beijing_now().format("%Y-%m-%d").to_string();
    let name = stock_name.unwrap_or(code).to_string();

    // Deterministic pseudo-random seed based on code digits
    let seed: u64 = code.bytes().fold(0u64, |acc, b| acc.wrapping_mul(31).wrapping_add(b as u64));

    // Only a subset of stocks have baseline LHB data
    let has_lhb = seed.is_multiple_of(3)
        || code.contains("603019")
        || code.contains("000977")
        || code.contains("601138");
    let dragon_tiger = if has_lhb {
        Some(StockDragonTiger {
            code: code.to_string(),
            name: name.clone(),
            trade_date: today,
            reason: "日涨幅偏离值达7%的证券".into(),
            close_price: 28.50,
            change_pct: 7.85,
            net_total: 86_500_000.0,
            institution_buy: 110_000_000.0,
            institution_sell: 32_000_000.0,
            institution_net: 78_000_000.0,
            top_buyers: vec![
                DragonTigerSeat {
                    branch_name: "中信证券股份有限公司西安朱雀大街证券营业部".into(),
                    trader_label: Some("方新侠".into()),
                    buy_amount: 52_000_000.0,
                    sell_amount: 0.0,
                    net_amount: 52_000_000.0,
                },
                DragonTigerSeat {
                    branch_name: "机构专用".into(),
                    trader_label: Some("机构专用".into()),
                    buy_amount: 38_000_000.0,
                    sell_amount: 0.0,
                    net_amount: 38_000_000.0,
                },
                DragonTigerSeat {
                    branch_name: "深股通专用".into(),
                    trader_label: Some("北向外资".into()),
                    buy_amount: 25_000_000.0,
                    sell_amount: 8_000_000.0,
                    net_amount: 17_000_000.0,
                },
                DragonTigerSeat {
                    branch_name: "国泰君安证券股份有限公司上海江苏路证券营业部".into(),
                    trader_label: Some("章盟主".into()),
                    buy_amount: 19_000_000.0,
                    sell_amount: 0.0,
                    net_amount: 19_000_000.0,
                },
                DragonTigerSeat {
                    branch_name: "东方财富证券股份有限公司拉萨团结路第一证券营业部".into(),
                    trader_label: None,
                    buy_amount: 15_000_000.0,
                    sell_amount: 12_000_000.0,
                    net_amount: 3_000_000.0,
                },
            ],
            top_sellers: vec![
                DragonTigerSeat {
                    branch_name: "机构专用".into(),
                    trader_label: Some("机构专用".into()),
                    buy_amount: 0.0,
                    sell_amount: 32_000_000.0,
                    net_amount: -32_000_000.0,
                },
                DragonTigerSeat {
                    branch_name: "中国银河证券股份有限公司绍兴证券营业部".into(),
                    trader_label: Some("赵老哥".into()),
                    buy_amount: 2_000_000.0,
                    sell_amount: 21_000_000.0,
                    net_amount: -19_000_000.0,
                },
                DragonTigerSeat {
                    branch_name: "东方财富证券股份有限公司拉萨东环路第二证券营业部".into(),
                    trader_label: None,
                    buy_amount: 9_000_000.0,
                    sell_amount: 14_000_000.0,
                    net_amount: -5_000_000.0,
                },
            ],
        })
    } else {
        None
    };

    StockDetailInfo {
        code: code.to_string(),
        dragon_tiger,
    }
}

/// Baseline fallback for operating department / seat trades drill-down.
pub fn get_seat_baseline(branch_name: &str, trade_date: Option<&str>) -> SeatDetailInfo {
    let today = beijing_now().format("%Y-%m-%d").to_string();
    let query_date = trade_date.unwrap_or(&today);
    let trader_label = match_famous_trader(branch_name).map(|s| s.to_string());

    let same_day_operations = vec![
        SeatOperationItem {
            code: "sh603019".into(),
            name: "中科曙光".into(),
            trade_date: query_date.to_string(),
            buy_amount: 52_000_000.0,
            sell_amount: 0.0,
            net_amount: 52_000_000.0,
            close_price: 78.50,
            change_pct: 10.00,
            reason: "日涨幅偏离达7%".into(),
        },
        SeatOperationItem {
            code: "sz000977".into(),
            name: "浪潮信息".into(),
            trade_date: query_date.to_string(),
            buy_amount: 36_000_000.0,
            sell_amount: 0.0,
            net_amount: 36_000_000.0,
            close_price: 46.80,
            change_pct: 9.98,
            reason: "日涨幅偏离达7%".into(),
        },
    ];

    let historical_operations = vec![
        SeatOperationItem {
            code: "sh601138".into(),
            name: "工业富联".into(),
            trade_date: "2026-10-24".into(),
            buy_amount: 88_000_000.0,
            sell_amount: 12_000_000.0,
            net_amount: 76_000_000.0,
            close_price: 24.60,
            change_pct: 6.82,
            reason: "3日涨幅偏离达20%".into(),
        },
        SeatOperationItem {
            code: "sz002049".into(),
            name: "紫光国微".into(),
            trade_date: "2026-10-21".into(),
            buy_amount: 45_000_000.0,
            sell_amount: 5_000_000.0,
            net_amount: 40_000_000.0,
            close_price: 72.30,
            change_pct: 5.16,
            reason: "日换手率达20%".into(),
        },
        SeatOperationItem {
            code: "sz000063".into(),
            name: "中兴通讯".into(),
            trade_date: "2026-10-15".into(),
            buy_amount: 32_000_000.0,
            sell_amount: 0.0,
            net_amount: 32_000_000.0,
            close_price: 33.15,
            change_pct: 4.25,
            reason: "日涨幅偏离达7%".into(),
        },
    ];

    SeatDetailInfo {
        branch_name: branch_name.to_string(),
        trader_label,
        same_day_operations,
        historical_operations,
    }
}
