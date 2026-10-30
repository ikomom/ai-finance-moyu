//! Unit tests for portfolio simulation, commission calculations, and trade execution.

use super::account::*;
use super::engine::*;
use super::fee::*;
use super::rules::*;
use super::types::*;

#[test]
fn test_asset_class_classification() {
    assert_eq!(AssetClass::from_code("sh600000"), AssetClass::Stock);
    assert_eq!(AssetClass::from_code("sz000001"), AssetClass::Stock);
    assert_eq!(AssetClass::from_code("sz300750"), AssetClass::Stock);
    assert_eq!(AssetClass::from_code("sh688981"), AssetClass::Stock);
    assert_eq!(AssetClass::from_code("bj832023"), AssetClass::Stock);
    assert_eq!(AssetClass::from_code("sh510300"), AssetClass::Etf);
    assert_eq!(AssetClass::from_code("sz159915"), AssetClass::Etf);
    assert_eq!(AssetClass::from_code("sh113009"), AssetClass::ConvertibleBond);
}

#[test]
fn test_fee_calculation_presets() {
    let vip = BrokerFeeConfig::preset("vip_low");
    let fee_stock_buy = calculate_fee(AssetClass::Stock, TradeAction::Buy, 10.0, 1000, &vip);
    assert!((fee_stock_buy - 0.95).abs() < 0.02);

    let fee_stock_sell = calculate_fee(AssetClass::Stock, TradeAction::Sell, 10.0, 1000, &vip);
    assert!((fee_stock_sell - 5.95).abs() < 0.02);

    let fee_etf_sell = calculate_fee(AssetClass::Etf, TradeAction::Sell, 10.0, 1000, &vip);
    assert!((fee_etf_sell - 0.5).abs() < 0.02);
}

fn test_portfolio_with_broker() -> (PortfolioData, String) {
    let mut data = PortfolioData {
        strict_mode: false, // Sandbox mode for non-boundary unit arithmetic
        ..Default::default()
    };
    let b_id = "default".to_string();
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
fn test_default_portfolio_is_empty_and_strict() {
    let data = PortfolioData::default();
    assert!(data.brokers.is_empty());
    assert!(data.active_broker_id.is_none());
    assert!(data.strict_mode);
}

#[test]
fn test_transfer_cash_deposit_and_withdraw() {
    let (mut data, b_id) = test_portfolio_with_broker();
    transfer_cash(&mut data, &b_id, 50_000.0, true).unwrap();
    assert_eq!(data.brokers[0].available_cash, 150_000.0);
    transfer_cash(&mut data, &b_id, 20_000.0, false).unwrap();
    assert_eq!(data.brokers[0].available_cash, 130_000.0);
    assert!(transfer_cash(&mut data, &b_id, 200_000.0, false).is_err());
}

#[test]
fn test_buy_and_add_position_weighted_average() {
    let (mut data, b_id) = test_portfolio_with_broker();
    execute_trade(&mut data, mock_order(&b_id, "sh600000", TradeAction::Buy, 10.0, 1000)).unwrap();
    let pos = data.positions.iter().find(|p| p.code == "sh600000").unwrap();
    assert_eq!(pos.shares, 1000);

    execute_trade(&mut data, mock_order(&b_id, "sh600000", TradeAction::Buy, 12.0, 1000)).unwrap();
    let pos_after = data.positions.iter().find(|p| p.code == "sh600000").unwrap();
    assert_eq!(pos_after.shares, 2000);
    assert!((pos_after.cost_price - 11.0).abs() < 0.05);
}

#[test]
fn test_sell_position_and_realized_pnl() {
    let (mut data, b_id) = test_portfolio_with_broker();
    execute_trade(&mut data, mock_order(&b_id, "sh600000", TradeAction::Buy, 10.0, 1000)).unwrap();
    let res_sell = execute_trade(&mut data, mock_order(&b_id, "sh600000", TradeAction::Sell, 12.0, 500)).unwrap();
    match res_sell {
        OrderExecutionStatus::Filled { record: rec_sell } => {
            assert_eq!(rec_sell.action, TradeAction::Sell);
            assert!(rec_sell.realized_pnl.unwrap() > 950.0);
        }
        _ => panic!("Expected filled status"),
    }

    execute_trade(&mut data, mock_order(&b_id, "sh600000", TradeAction::Sell, 12.0, 500)).unwrap();
    assert!(!data.positions.iter().any(|p| p.code == "sh600000"));
}

#[test]
fn test_reset_mechanisms() {
    let (mut data, b_id) = test_portfolio_with_broker();
    execute_trade(&mut data, mock_order(&b_id, "sh600000", TradeAction::Buy, 10.0, 1000)).unwrap();
    reset_position(&mut data, &b_id, "sh600000").unwrap();
    assert_eq!(data.positions.len(), 0);

    reset_broker(&mut data, &b_id).unwrap();
    assert_eq!(data.brokers[0].available_cash, data.brokers[0].initial_cash);
    assert_eq!(data.trades.len(), 0);
}

#[test]
fn test_t_plus_one_and_available_shares() {
    let pos = PortfolioPosition {
        broker_id: "b1".into(),
        code: "sh600000".into(),
        name: "浦发银行".into(),
        shares: 1000,
        cost_price: 10.0,
        updated_at: "2026-10-29 10:00:00".into(),
    };
    let today = "2026-10-29";
    let trades = vec![TradeRecord {
        id: "t1".into(),
        broker_id: "b1".into(),
        broker_name: "Broker".into(),
        code: "sh600000".into(),
        name: "浦发银行".into(),
        action: TradeAction::Buy,
        price: 10.0,
        shares: 600,
        amount: 6000.0,
        fee: 0.5,
        realized_pnl: None,
        realized_pct: None,
        timestamp: "2026-10-29 09:35:00".into(),
        status: TradeRecordStatus::Filled,
    }];

    // Stock: 1000 total - 600 bought today = 400 available to sell
    let avail_stock = calculate_available_shares(&pos, &trades, today);
    assert_eq!(avail_stock, 400);

    // ETF: T+0 allows selling all 1000 shares
    let pos_etf = PortfolioPosition { code: "sh510300".into(), ..pos };
    let avail_etf = calculate_available_shares(&pos_etf, &trades, today);
    assert_eq!(avail_etf, 1000);
}


#[test]
fn test_invalid_price_and_shares_rejection() {
    let (mut data, b_id) = test_portfolio_with_broker();
    let nan_order = mock_order(&b_id, "sz002428", TradeAction::Buy, f64::NAN, 100);
    assert!(execute_trade(&mut data, nan_order).is_err());
    let zero_order = mock_order(&b_id, "sz002428", TradeAction::Buy, 0.0, 100);
    assert!(execute_trade(&mut data, zero_order).is_err());
    let zero_shares = mock_order(&b_id, "sz002428", TradeAction::Buy, 10.0, 0);
    assert!(execute_trade(&mut data, zero_shares).is_err());
}

#[test]
fn test_multi_broker_position_isolation() {
    let mut data = PortfolioData {
        strict_mode: false,
        ..Default::default()
    };
    let b1 = "b1".to_string();
    let b2 = "b2".to_string();
    data.brokers.push(BrokerAccount::new(&b1, "B1", 50000.0));
    data.brokers.push(BrokerAccount::new(&b2, "B2", 50000.0));

    execute_trade(&mut data, mock_order(&b1, "sz002428", TradeAction::Buy, 50.0, 200)).unwrap();
    assert_eq!(data.positions.iter().find(|p| p.broker_id == b1 && p.code == "sz002428").unwrap().shares, 200);
    assert!(!data.positions.iter().any(|p| p.broker_id == b2 && p.code == "sz002428"));
    assert!(execute_trade(&mut data, mock_order(&b2, "sz002428", TradeAction::Sell, 55.0, 100)).is_err());
}


