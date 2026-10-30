//! Tests for order boundaries, pending limit matching, cancellation, and share freezing.

use super::cancellation::*;
use super::engine::*;
use super::matcher::*;
use super::rules::*;
use super::summary::*;
use super::types::*;
use crate::quote::Quote;
use std::collections::HashMap;

fn mock_test_broker() -> (PortfolioData, String) {
    let mut data = PortfolioData {
        strict_mode: false,
        ..Default::default()
    };
    let b_id = "test_broker".to_string();
    data.brokers.push(BrokerAccount::new(&b_id, "测试券商", 100_000.0));
    data.active_broker_id = Some(b_id.clone());
    (data, b_id)
}

fn mock_order(b: &str, c: &str, act: TradeAction, p: f64, s: u32) -> TradeOrder {
    TradeOrder {
        broker_id: b.into(),
        code: c.into(),
        name: Some("测试股票".into()),
        action: act,
        price: p,
        shares: s,
        pre_close: None,
        bids: None,
        asks: None,
        order_id: None,
    }
}

#[test]
fn test_boundary_order_validations() {
    let order_odd_buy = mock_order("b1", "sh600000", TradeAction::Buy, 10.0, 150);
    // 150 shares buy rejected in strict mode
    let res = validate_order_boundaries(&order_odd_buy, None, &[], &[], None, true);
    assert!(res.is_err());

    // Price limits check
    let order_limit_up = mock_order("b1", "sh600000", TradeAction::Buy, 11.50, 100);
    let res_limit = validate_order_boundaries(&order_limit_up, None, &[], &[], Some(10.0), true);
    assert!(res_limit.is_err());

    // Sandbox mode disables all checks
    assert!(validate_order_boundaries(&order_odd_buy, None, &[], &[], None, false).is_ok());
}

#[test]
fn test_liquidity_depth_and_limit_board_rules() {
    let mut order = mock_order("b1", "sh600000", TradeAction::Buy, 10.0, 500);
    // ask1 is 2 hands = 200 shares. 50% is 100 shares. Buying 500 shares exceeds 50% depth cap
    order.asks = Some(vec![(10.0, 2.0)]);
    let err = validate_order_boundaries(&order, None, &[], &[], Some(10.0), true).unwrap_err();
    assert!(err.contains("盘口吃单深度受限") || err.contains("非连续交易时段"));

    // In sandbox mode, boundaries are bypassed
    assert!(validate_order_boundaries(&order, None, &[], &[], Some(10.0), false).is_ok());

    // Test limit-up with empty asks in strict mode
    let mut limit_up_order = mock_order("b1", "sh600000", TradeAction::Buy, 11.0, 100);
    limit_up_order.asks = Some(vec![]);
    let up_err = validate_order_boundaries(&limit_up_order, None, &[], &[], Some(10.0), true).unwrap_err();
    assert!(up_err.contains("流动性封锁") || up_err.contains("非连续交易时段"));
}

#[test]
fn test_sell_order_freezes_shares_against_overselling() {
    let pos = PortfolioPosition {
        broker_id: "b1".into(),
        code: "sh600000".into(),
        name: "浦发银行".into(),
        shares: 1000,
        cost_price: 10.0,
        updated_at: "2026-10-29 09:30:00".into(),
    };
    let pending_sell = vec![PendingOrder {
        id: "order_sell_1".into(),
        broker_id: "b1".into(),
        broker_name: "测试券商".into(),
        code: "sh600000".into(),
        name: "浦发银行".into(),
        action: TradeAction::Sell,
        price: 12.0,
        shares: 600,
        frozen_cash: 0.0,
        created_at: "2026-10-30 09:35:00".into(),
    }];

    // Attempting to sell 500 shares while 600 of 1000 are pending should fail
    let order_oversell = mock_order("b1", "sh600000", TradeAction::Sell, 11.0, 500);
    let err = validate_order_boundaries(&order_oversell, Some(&pos), &[], &pending_sell, None, true).unwrap_err();
    assert!(err.contains("可用持仓不足") || err.contains("非连续交易时段"));

    // Summary calculation should also reflect available_shares = 400
    let mut data = PortfolioData::default();
    data.positions.push(pos);
    data.pending_orders = pending_sell;
    let quotes = HashMap::new();
    let sum = compute_portfolio_summary(&data, &quotes);
    assert_eq!(sum.positions[0].available_shares, 400);
}

#[test]
fn test_order_activity_records_pending_and_cancel_inplace() {
    let (mut data, b_id) = mock_test_broker();
    let mut order = mock_order(&b_id, "sh600000", TradeAction::Buy, 9.0, 100);
    order.asks = Some(vec![(10.0, 100.0)]);
    let res = execute_trade(&mut data, order).unwrap();
    match res {
        OrderExecutionStatus::Pending { order: pending } => {
            assert_eq!(data.trades.len(), 1);
            assert_eq!(data.trades[0].status, TradeRecordStatus::Pending);
            assert_eq!(data.trades[0].shares, 100);

            data.strict_mode = false;
            cancel_pending_order(&mut data, &pending.id).unwrap();
            // In-place update: length remains 1, status updated to Cancelled
            assert_eq!(data.trades.len(), 1);
            assert_eq!(data.trades[0].status, TradeRecordStatus::Cancelled);
        }
        _ => panic!("Expected pending status"),
    }
}

#[test]
fn test_matcher_inplace_fills_pending_trade_record() {
    let (mut data, b_id) = mock_test_broker();
    let mut order = mock_order(&b_id, "sh600000", TradeAction::Buy, 9.0, 100);
    order.asks = Some(vec![(10.0, 100.0)]);
    let res = execute_trade(&mut data, order).unwrap();
    let pending_id = match res {
        OrderExecutionStatus::Pending { order: p } => p.id,
        _ => panic!("Expected pending order"),
    };
    assert_eq!(data.trades.len(), 1);
    assert_eq!(data.trades[0].status, TradeRecordStatus::Pending);

    // Simulate market dropping to match limit price
    let mut quotes = HashMap::new();
    quotes.insert("sh600000".into(), Quote {
        code: "sh600000".into(),
        name: "浦发银行".into(),
        price: 8.9,
        pre_close: 10.0,
        asks: vec![(8.9, 100.0)],
        ..Default::default()
    });

    let filled = match_pending_orders(&mut data, &quotes);
    assert_eq!(filled.len(), 1);
    assert_eq!(data.trades.len(), 1);
    assert_eq!(data.trades[0].id, pending_id);
    assert_eq!(data.trades[0].status, TradeRecordStatus::Filled);
    assert_eq!(data.trades[0].price, 9.0);
}

#[test]
fn test_summary_frozen_cash_and_price_fallback() {
    let (mut data, b_id) = mock_test_broker();
    data.positions.push(PortfolioPosition {
        broker_id: b_id.clone(), code: "sh600000".into(), name: "浦发银行".into(),
        shares: 1000, cost_price: 10.0, updated_at: "2026-10-30 09:30:00".into(),
    });
    data.pending_orders.push(PendingOrder {
        id: "order_1".into(), broker_id: b_id.clone(), broker_name: "测试券商".into(),
        code: "sz000001".into(), name: "平安银行".into(), action: TradeAction::Buy,
        price: 10.0, shares: 1000, frozen_cash: 10005.0, created_at: "2026-10-30 09:35:00".into(),
    });

    let mut quotes = HashMap::new();
    quotes.insert("sh600000".into(), Quote {
        code: "sh600000".into(), name: "浦发银行".into(), price: 0.0, pre_close: 12.0, ..Default::default()
    });

    let sum = compute_portfolio_summary(&data, &quotes);
    assert_eq!(sum.positions[0].current_price, 12.0);
    assert_eq!(sum.positions[0].market_value, 12000.0);
    assert_eq!(sum.total_cash, 110005.0);
    assert_eq!(sum.total_equity, 122005.0);
}

#[test]
fn test_matcher_restores_frozen_cash_on_execution_failure() {
    let (mut data, b_id) = mock_test_broker();
    data.brokers[0].available_cash = 5000.0;
    data.pending_orders.push(PendingOrder {
        id: "order_fail".into(), broker_id: b_id.clone(), broker_name: "测试券商".into(),
        code: "sh600000".into(), name: "浦发银行".into(), action: TradeAction::Buy,
        price: 10.0, shares: 1000, frozen_cash: 10005.0, created_at: "2026-10-30 09:30:00".into(),
    });

    let mut quotes = HashMap::new();
    quotes.insert("sh600000".into(), Quote {
        code: "sh600000".into(), name: "浦发银行".into(), price: 9.8, pre_close: 10.0,
        asks: vec![(9.8, 100.0)], ..Default::default()
    });

    data.strict_mode = true;
    let initial_cash = data.brokers[0].available_cash;
    let filled = match_pending_orders(&mut data, &quotes);

    assert!(filled.is_empty());
    assert_eq!(data.pending_orders.len(), 1);
    assert_eq!(data.brokers[0].available_cash, initial_cash);
}
