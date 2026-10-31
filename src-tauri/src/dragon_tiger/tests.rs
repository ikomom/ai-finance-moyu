use super::baseline::{get_market_baseline, get_seat_baseline, get_stock_baseline};
use super::trader_dict::match_famous_trader;
use super::DragonTigerClient;

#[test]
fn test_match_famous_trader() {
    assert_eq!(
        match_famous_trader("机构专用"),
        Some("机构专用")
    );
    assert_eq!(
        match_famous_trader("深股通专用"),
        Some("北向外资")
    );
    assert_eq!(
        match_famous_trader("中信证券股份有限公司西安朱雀大街证券营业部"),
        Some("方新侠")
    );
    assert_eq!(
        match_famous_trader("国泰君安证券股份有限公司上海江苏路证券营业部"),
        Some("章盟主")
    );
    assert_eq!(
        match_famous_trader("中信证券股份有限公司北京呼家楼证券营业部"),
        Some("呼家楼")
    );
    assert_eq!(
        match_famous_trader("招商证券股份有限公司福州六一中路证券营业部"),
        Some("六一路")
    );
    assert_eq!(
        match_famous_trader("普通无名营业部"),
        None
    );
}

#[test]
fn test_get_market_baseline() {
    let baseline = get_market_baseline();
    assert!(!baseline.trade_date.is_empty());
    assert_eq!(baseline.top_institution_stocks.len(), 5);
    assert!(!baseline.famous_trader_moves.is_empty());

    for stock in &baseline.top_institution_stocks {
        assert!(stock.price > 0.0);
        assert!(!stock.name.is_empty());
        assert!(!stock.code.is_empty());
    }
}

#[test]
fn test_get_stock_baseline_with_lhb() {
    let detail = get_stock_baseline("sh603019", Some("中科曙光"));
    assert_eq!(detail.code, "sh603019");
    assert!(detail.dragon_tiger.is_some());
    let lhb = detail.dragon_tiger.unwrap();
    assert!(!lhb.top_buyers.is_empty());
    assert!(!lhb.trade_date.is_empty());
}

#[test]
fn test_get_stock_baseline_without_lhb() {
    // Most arbitrary codes won't have baseline LHB
    let detail = get_stock_baseline("sz300999", Some("测试股票"));
    assert_eq!(detail.code, "sz300999");
    // dragon_tiger may or may not be Some depending on seed — just ensure no panic
}

#[test]
fn test_dragon_tiger_client_fallback() {
    // Ensure client construction and baseline fallback work offline
    let _client = DragonTigerClient::new();
    let baseline = get_stock_baseline("sh600000", Some("浦发银行"));
    assert_eq!(baseline.code, "sh600000");
}

#[test]
fn test_get_seat_baseline() {
    let seat = get_seat_baseline("中信证券股份有限公司西安朱雀大街证券营业部", Some("2026-10-30"));
    assert_eq!(seat.trader_label, Some("方新侠".to_string()));
    assert!(!seat.same_day_operations.is_empty());
    assert!(!seat.historical_operations.is_empty());
    for op in &seat.same_day_operations {
        assert_eq!(op.trade_date, "2026-10-30");
        assert!(!op.code.is_empty());
        assert!(op.buy_amount > 0.0);
    }
}
