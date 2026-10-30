//! Pending order cancellation, bulk cancelling, and stale order expiration.

use super::types::*;

/// Cancel an active pending limit order, refunding frozen cash for buy orders.
pub fn cancel_pending_order(data: &mut PortfolioData, order_id: &str) -> Result<PendingOrder, String> {
    super::rules::validate_cancel_order_boundaries(data.strict_mode)?;

    let idx = data
        .pending_orders
        .iter()
        .position(|o| o.id == order_id)
        .ok_or_else(|| format!("未找到该委托挂单或订单已成交: {}", order_id))?;

    let order = data.pending_orders.remove(idx);
    if order.action == TradeAction::Buy && order.frozen_cash > 0.0 {
        if let Some(broker) = data.brokers.iter_mut().find(|b| b.id == order.broker_id) {
            broker.available_cash += order.frozen_cash;
            broker.available_cash = (broker.available_cash * 100.0).round() / 100.0;
        }
    }

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    if let Some(existing) = data.trades.iter_mut().find(|t| t.id == order.id) {
        existing.status = TradeRecordStatus::Cancelled;
        existing.timestamp = now;
    } else {
        let cancel_rec = TradeRecord {
            id: format!("cancel_{}", chrono::Local::now().timestamp_millis()),
            broker_id: order.broker_id.clone(),
            broker_name: order.broker_name.clone(),
            code: order.code.clone(),
            name: order.name.clone(),
            action: order.action,
            price: order.price,
            shares: order.shares,
            amount: order.price * (order.shares as f64),
            fee: 0.0,
            realized_pnl: None,
            realized_pct: None,
            timestamp: now,
            status: TradeRecordStatus::Cancelled,
        };
        data.trades.insert(0, cancel_rec);
    }

    let action_str = if order.action == TradeAction::Buy { "买入" } else { "卖出" };
    log::info!(
        target: "TRADE",
        "【撤单】券商={}: {} ({}) 撤销{}挂单 ¥{:.2} x {}股，已解冻资金/持仓",
        order.broker_name, order.name, order.code, action_str, order.price, order.shares
    );
    Ok(order)
}

/// Cancel all active pending limit orders for a broker (or all brokers), refunding frozen cash.
pub fn cancel_all_pending_orders(
    data: &mut PortfolioData,
    broker_id: Option<&str>,
) -> Result<Vec<PendingOrder>, String> {
    super::rules::validate_cancel_order_boundaries(data.strict_mode)?;

    let mut cancelled = Vec::new();
    let mut remaining = Vec::new();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let orders = std::mem::take(&mut data.pending_orders);
    for order in orders {
        let matches = broker_id.map(|b| b == order.broker_id).unwrap_or(true);
        if matches {
            if order.action == TradeAction::Buy && order.frozen_cash > 0.0 {
                if let Some(broker) = data.brokers.iter_mut().find(|b| b.id == order.broker_id) {
                    broker.available_cash += order.frozen_cash;
                    broker.available_cash = (broker.available_cash * 100.0).round() / 100.0;
                }
            }
            if let Some(existing) = data.trades.iter_mut().find(|t| t.id == order.id) {
                existing.status = TradeRecordStatus::Cancelled;
                existing.timestamp = now.clone();
            } else {
                let cancel_rec = TradeRecord {
                    id: format!("cancel_{}_{}", chrono::Local::now().timestamp_millis(), order.id),
                    broker_id: order.broker_id.clone(),
                    broker_name: order.broker_name.clone(),
                    code: order.code.clone(),
                    name: order.name.clone(),
                    action: order.action,
                    price: order.price,
                    shares: order.shares,
                    amount: order.price * (order.shares as f64),
                    fee: 0.0,
                    realized_pnl: None,
                    realized_pct: None,
                    timestamp: now.clone(),
                    status: TradeRecordStatus::Cancelled,
                };
                data.trades.insert(0, cancel_rec);
            }

            let action_str = if order.action == TradeAction::Buy { "买入" } else { "卖出" };
            log::info!(
                target: "TRADE",
                "【撤单】券商={}: {} ({}) 批量撤销{}挂单 ¥{:.2} x {}股，已解冻资金/持仓",
                order.broker_name, order.name, order.code, action_str, order.price, order.shares
            );
            cancelled.push(order);
        } else {
            remaining.push(order);
        }
    }

    data.pending_orders = remaining;
    Ok(cancelled)
}

/// Automatically expire and refund unfulfilled limit orders from prior days.
pub fn expire_stale_pending_orders(data: &mut PortfolioData) -> usize {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut count = 0;
    let mut active = Vec::new();

    let orders = std::mem::take(&mut data.pending_orders);
    for order in orders {
        if !order.created_at.starts_with(&today) {
            if order.action == TradeAction::Buy && order.frozen_cash > 0.0 {
                if let Some(broker) = data.brokers.iter_mut().find(|b| b.id == order.broker_id) {
                    broker.available_cash += order.frozen_cash;
                    broker.available_cash = (broker.available_cash * 100.0).round() / 100.0;
                }
            }
            if let Some(existing) = data.trades.iter_mut().find(|t| t.id == order.id) {
                existing.status = TradeRecordStatus::Expired;
                existing.timestamp = now.clone();
            } else {
                let expire_rec = TradeRecord {
                    id: format!("expire_{}", order.id),
                    broker_id: order.broker_id.clone(),
                    broker_name: order.broker_name.clone(),
                    code: order.code.clone(),
                    name: order.name.clone(),
                    action: order.action,
                    price: order.price,
                    shares: order.shares,
                    amount: order.price * (order.shares as f64),
                    fee: 0.0,
                    realized_pnl: None,
                    realized_pct: None,
                    timestamp: now.clone(),
                    status: TradeRecordStatus::Expired,
                };
                data.trades.insert(0, expire_rec);
            }

            log::info!(
                target: "TRADE",
                "【失效】券商={}: {} ({}) 挂单隔日失效自动作废，已全额解冻资金/持仓",
                order.broker_name, order.name, order.code
            );
            count += 1;
        } else {
            active.push(order);
        }
    }

    data.pending_orders = active;
    count
}
