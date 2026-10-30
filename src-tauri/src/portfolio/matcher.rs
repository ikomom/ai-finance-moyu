//! Market quote-driven matching engine for pending limit orders.

use std::collections::HashMap;
use crate::quote::Quote;
use super::engine::execute_trade;
use super::types::{OrderExecutionStatus, PortfolioData, TradeAction, TradeOrder, TradeRecord};

/// Scan all pending limit orders against real-time market quotes and fill matching ones.
pub fn match_pending_orders(data: &mut PortfolioData, quotes: &HashMap<String, Quote>) -> Vec<TradeRecord> {
    if data.pending_orders.is_empty() {
        return Vec::new();
    }

    let mut filled_records = Vec::new();
    let mut remaining_orders = Vec::new();

    let pending = std::mem::take(&mut data.pending_orders);
    for order in pending {
        let quote = quotes.get(&order.code);
        let should_fill = if let Some(q) = quote {
            if q.price <= 0.0 {
                false
            } else {
                match order.action {
                    TradeAction::Buy => {
                        let ask1 = q.asks.first().map(|a| a.0).unwrap_or(q.price);
                        q.price <= order.price || (ask1 > 0.0 && ask1 <= order.price)
                    }
                    TradeAction::Sell => {
                        let bid1 = q.bids.first().map(|b| b.0).unwrap_or(q.price);
                        q.price >= order.price || (bid1 > 0.0 && bid1 >= order.price)
                    }
                }
            }
        } else {
            false
        };

        if should_fill {
            let frozen = order.frozen_cash;
            if order.action == TradeAction::Buy && frozen > 0.0 {
                if let Some(broker) = data.brokers.iter_mut().find(|b| b.id == order.broker_id) {
                    broker.available_cash += frozen;
                }
            }

            let trade_order = TradeOrder {
                broker_id: order.broker_id.clone(),
                code: order.code.clone(),
                name: Some(order.name.clone()),
                action: order.action,
                price: order.price,
                shares: order.shares,
                pre_close: quote.map(|q| q.pre_close),
                bids: None,
                asks: None,
            };

            match execute_trade(data, trade_order) {
                Ok(OrderExecutionStatus::Filled { record }) => {
                    log::info!(
                        target: "TRADE",
                        "【撮合成交】券商={}: {} ({}) 挂单撮合成交 ¥{:.2} x {}股",
                        record.broker_name, record.name, record.code, record.price, record.shares
                    );
                    filled_records.push(record);
                }
                Ok(OrderExecutionStatus::Pending { order: re_pending }) => {
                    remaining_orders.push(re_pending);
                }
                Err(e) => {
                    log::warn!(target: "USER", "挂单撮合异常({e})，保留排队并回滚解冻现金");
                    if order.action == TradeAction::Buy && frozen > 0.0 {
                        if let Some(broker) = data.brokers.iter_mut().find(|b| b.id == order.broker_id) {
                            broker.available_cash -= frozen;
                            broker.available_cash = (broker.available_cash * 100.0).round() / 100.0;
                        }
                    }
                    remaining_orders.push(order);
                }
            }
        } else {
            remaining_orders.push(order);
        }
    }

    data.pending_orders = remaining_orders;
    filled_records
}
