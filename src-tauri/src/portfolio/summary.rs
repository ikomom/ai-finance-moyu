//! Portfolio summary calculation and presentation aggregation.

use std::collections::HashMap;
use crate::quote::Quote;
use super::rules::{calculate_available_shares, compute_position_today_pnl};
use super::types::{PortfolioData, PortfolioSummary, PositionView, TradeAction, TradeRecordStatus};

/// Aggregates portfolio holdings, cash balances, floating and realized profits across all brokers.
pub fn compute_portfolio_summary(
    portfolio: &PortfolioData,
    quotes: &HashMap<String, Quote>,
) -> PortfolioSummary {
    let mut position_views = Vec::new();
    let mut total_market_value: f64 = 0.0;
    let mut total_cost_value: f64 = 0.0;
    let mut today_pnl: f64 = 0.0;
    let today_date = chrono::Local::now().format("%Y-%m-%d").to_string();

    for pos in &portfolio.positions {
        let broker_name = portfolio
            .brokers
            .iter()
            .find(|b| b.id == pos.broker_id)
            .map(|b| b.name.clone())
            .unwrap_or_else(|| "未知券商".into());

        let quote = quotes.get(&pos.code);
        let current_price = quote
            .and_then(|q| {
                if q.price > 0.0 {
                    Some(q.price)
                } else if q.pre_close > 0.0 {
                    Some(q.pre_close)
                } else {
                    None
                }
            })
            .unwrap_or(pos.cost_price);
        let pre_close = quote
            .and_then(|q| if q.pre_close > 0.0 { Some(q.pre_close) } else { None })
            .unwrap_or(current_price);
        let shares_f64 = pos.shares as f64;

        let market_val = current_price * shares_f64;
        let cost_val = pos.cost_price * shares_f64;
        let float_pnl = market_val - cost_val;
        let float_pnl_pct = if cost_val > 0.0 { (float_pnl / cost_val) * 100.0 } else { 0.0 };

        let pos_today_pnl = compute_position_today_pnl(pos, &portfolio.trades, current_price, pre_close, &today_date);
        let base_avail = calculate_available_shares(pos, &portfolio.trades, &today_date);
        let pending_sell: u32 = portfolio
            .pending_orders
            .iter()
            .filter(|p| p.broker_id == pos.broker_id && p.code == pos.code && p.action == TradeAction::Sell)
            .map(|p| p.shares)
            .sum();
        let available_shares = base_avail.saturating_sub(pending_sell);
        total_market_value += market_val;
        total_cost_value += cost_val;
        today_pnl += pos_today_pnl;

        position_views.push(PositionView {
            broker_id: pos.broker_id.clone(),
            broker_name,
            code: pos.code.clone(),
            name: pos.name.clone(),
            shares: pos.shares,
            available_shares,
            cost_price: pos.cost_price,
            current_price,
            market_value: (market_val * 100.0).round() / 100.0,
            floating_pnl: (float_pnl * 100.0).round() / 100.0,
            floating_pnl_pct: (float_pnl_pct * 100.0).round() / 100.0,
            today_pnl: (pos_today_pnl * 100.0).round() / 100.0,
            updated_at: pos.updated_at.clone(),
        });
    }

    // Include today's realized PnL for stocks that have been fully sold out today
    for t in &portfolio.trades {
        if t.status == TradeRecordStatus::Filled && t.action == TradeAction::Sell && t.timestamp.starts_with(&today_date) {
            let has_open_pos = portfolio
                .positions
                .iter()
                .any(|p| p.broker_id == t.broker_id && p.code == t.code);
            if !has_open_pos {
                today_pnl += t.realized_pnl.unwrap_or(0.0);
            }
        }
    }

    let total_frozen_cash: f64 = portfolio.pending_orders.iter().map(|o| o.frozen_cash).sum();
    let total_cash: f64 = portfolio.brokers.iter().map(|b| b.available_cash).sum::<f64>() + total_frozen_cash;
    let total_equity: f64 = total_cash + total_market_value;
    let total_pnl: f64 = total_market_value - total_cost_value;
    let total_pnl_pct: f64 = if total_cost_value > 0.0 { (total_pnl / total_cost_value) * 100.0 } else { 0.0 };
    let position_ratio: f64 = if total_equity > 0.0 { (total_market_value / total_equity) * 100.0 } else { 0.0 };

    PortfolioSummary {
        active_broker_id: portfolio.active_broker_id.clone(),
        total_equity: (total_equity * 100.0).round() / 100.0,
        total_market_value: (total_market_value * 100.0).round() / 100.0,
        total_cash: (total_cash * 100.0).round() / 100.0,
        total_pnl: (total_pnl * 100.0).round() / 100.0,
        total_pnl_pct: (total_pnl_pct * 100.0).round() / 100.0,
        today_pnl: (today_pnl * 100.0).round() / 100.0,
        position_ratio: (position_ratio * 100.0).round() / 100.0,
        brokers: portfolio.brokers.clone(),
        positions: position_views,
        trades: portfolio.trades.clone(),
        pending_orders: portfolio.pending_orders.clone(),
        strict_mode: portfolio.strict_mode,
    }
}
