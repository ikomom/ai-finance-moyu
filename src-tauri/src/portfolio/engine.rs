//! Simulated execution engine, trade matching, and position ledger computation.

use super::fee::calculate_fee;
use super::types::*;

/// Execute a simulated trade order on the portfolio data.
pub fn execute_trade(data: &mut PortfolioData, order: TradeOrder) -> Result<OrderExecutionStatus, String> {
    if order.shares == 0 {
        return Err("委托股数必须大于 0".into());
    }
    if !order.price.is_finite() || order.price <= 0.0 {
        return Err("委托价格不合法，必须大于 0".into());
    }

    let broker_idx = data
        .brokers
        .iter()
        .position(|b| b.id == order.broker_id)
        .ok_or_else(|| format!("未找到券商账户: {}", order.broker_id))?;

    let existing_pos = data
        .positions
        .iter()
        .find(|p| p.broker_id == order.broker_id && p.code == order.code);

    super::rules::validate_order_boundaries(
        &order,
        existing_pos,
        &data.trades,
        order.pre_close,
        data.strict_mode,
    )?;

    let asset_class = AssetClass::from_code(&order.code);
    let broker = &mut data.brokers[broker_idx];
    let fee = calculate_fee(asset_class, order.action, order.price, order.shares, &broker.fee_config);
    let gross_amount = order.price * (order.shares as f64);
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let record_id = format!("trade_{}", chrono::Local::now().timestamp_millis());
    let broker_name = broker.name.clone();
    let stock_name = order.name.clone().unwrap_or_else(|| order.code.clone());

    // Limit order queuing check
    let is_pending = match order.action {
        TradeAction::Buy => {
            if let Some(ref asks) = order.asks {
                asks.first().map(|a| a.0 > 0.0 && order.price < a.0).unwrap_or(false)
            } else {
                false
            }
        }
        TradeAction::Sell => {
            if let Some(ref bids) = order.bids {
                bids.first().map(|b| b.0 > 0.0 && order.price > b.0).unwrap_or(false)
            } else {
                false
            }
        }
    };

    if is_pending {
        let frozen_cash = if order.action == TradeAction::Buy {
            let total_cost = gross_amount + fee;
            if broker.available_cash < total_cost {
                return Err(format!(
                    "可用现金不足: 挂单需冻结 ¥{:.2}，可用仅剩 ¥{:.2}",
                    total_cost, broker.available_cash
                ));
            }
            broker.available_cash -= total_cost;
            broker.available_cash = (broker.available_cash * 100.0).round() / 100.0;
            gross_amount + fee
        } else {
            0.0
        };

        let pending = PendingOrder {
            id: format!("order_{}", chrono::Local::now().timestamp_millis()),
            broker_id: order.broker_id.clone(),
            broker_name: broker_name.clone(),
            code: order.code.clone(),
            name: stock_name.clone(),
            action: order.action,
            price: order.price,
            shares: order.shares,
            frozen_cash,
            created_at: now.clone(),
        };
        data.pending_orders.push(pending.clone());

        // Record pending order event into trades ledger
        let pending_rec = TradeRecord {
            id: pending.id.clone(),
            broker_id: order.broker_id,
            broker_name: broker_name.clone(),
            code: order.code.clone(),
            name: stock_name.clone(),
            action: order.action,
            price: order.price,
            shares: order.shares,
            amount: gross_amount,
            fee: 0.0,
            realized_pnl: None,
            realized_pct: None,
            timestamp: now,
            status: TradeRecordStatus::Pending,
        };
        data.trades.insert(0, pending_rec);

        let action_str = if order.action == TradeAction::Buy { "买入" } else { "卖出" };
        log::info!(
            target: "TRADE",
            "【挂单】券商={}: {} ({}) 限价{} ¥{:.2} x {}股，冻结现金¥{:.2}",
            broker_name, stock_name, order.code, action_str, order.price, order.shares, frozen_cash
        );
        return Ok(OrderExecutionStatus::Pending { order: pending });
    }

    match order.action {
        TradeAction::Buy => {
            let total_cost = gross_amount + fee;
            if broker.available_cash < total_cost {
                return Err(format!(
                    "可用现金不足: 需 ¥{:.2} (含手续费 ¥{:.2})，可用仅剩 ¥{:.2}",
                    total_cost, fee, broker.available_cash
                ));
            }
            broker.available_cash -= total_cost;
            broker.available_cash = (broker.available_cash * 100.0).round() / 100.0;

            let pos_idx = data
                .positions
                .iter()
                .position(|p| p.broker_id == order.broker_id && p.code == order.code);

            if let Some(idx) = pos_idx {
                let pos = &mut data.positions[idx];
                let old_shares = pos.shares as f64;
                let new_shares = pos.shares + order.shares;
                let new_cost = (pos.cost_price * old_shares + gross_amount + fee) / (new_shares as f64);
                pos.shares = new_shares;
                pos.cost_price = (new_cost * 1000.0).round() / 1000.0;
                pos.updated_at = now.clone();
            } else {
                let init_cost = (total_cost / (order.shares as f64) * 1000.0).round() / 1000.0;
                data.positions.push(PortfolioPosition {
                    broker_id: order.broker_id.clone(),
                    code: order.code.clone(),
                    name: stock_name.clone(),
                    shares: order.shares,
                    cost_price: init_cost,
                    updated_at: now.clone(),
                });
            }

            let record = TradeRecord {
                id: record_id,
                broker_id: order.broker_id,
                broker_name: broker_name.clone(),
                code: order.code.clone(),
                name: stock_name.clone(),
                action: TradeAction::Buy,
                price: order.price,
                shares: order.shares,
                amount: gross_amount,
                fee,
                realized_pnl: None,
                realized_pct: None,
                timestamp: now,
                status: TradeRecordStatus::Filled,
            };
            data.trades.insert(0, record.clone());
            log::info!(
                target: "TRADE",
                "【成交】券商={}: {} ({}) 买入成交 ¥{:.2} x {}股，金额¥{:.2}，手续费¥{:.2}",
                broker_name, stock_name, order.code, order.price, order.shares, gross_amount, fee
            );
            Ok(OrderExecutionStatus::Filled { record })
        }
        TradeAction::Sell => {
            let pos_idx = data
                .positions
                .iter()
                .position(|p| p.broker_id == order.broker_id && p.code == order.code)
                .ok_or_else(|| format!("当前券商未持有标的 {}", order.code))?;

            let pos = &data.positions[pos_idx];
            if pos.shares < order.shares {
                return Err(format!(
                    "持仓股数不足: 持有 {} 股，无法卖出 {} 股",
                    pos.shares, order.shares
                ));
            }

            let net_proceeds = gross_amount - fee;
            broker.available_cash += net_proceeds;
            broker.available_cash = (broker.available_cash * 100.0).round() / 100.0;

            let cost_basis = pos.cost_price * (order.shares as f64);
            let realized_pnl = net_proceeds - cost_basis;
            let realized_pct = if cost_basis > 0.0 { (realized_pnl / cost_basis) * 100.0 } else { 0.0 };

            if pos.shares == order.shares {
                data.positions.remove(pos_idx);
            } else {
                let pos_mut = &mut data.positions[pos_idx];
                pos_mut.shares -= order.shares;
                pos_mut.updated_at = now.clone();
            }

            let record = TradeRecord {
                id: record_id,
                broker_id: order.broker_id,
                broker_name: broker_name.clone(),
                code: order.code.clone(),
                name: stock_name.clone(),
                action: TradeAction::Sell,
                price: order.price,
                shares: order.shares,
                amount: gross_amount,
                fee,
                realized_pnl: Some((realized_pnl * 100.0).round() / 100.0),
                realized_pct: Some((realized_pct * 100.0).round() / 100.0),
                timestamp: now,
                status: TradeRecordStatus::Filled,
            };
            data.trades.insert(0, record.clone());
            log::info!(
                target: "TRADE",
                "【成交】券商={}: {} ({}) 卖出成交 ¥{:.2} x {}股，金额¥{:.2}，手续费¥{:.2}，实现盈亏¥{:.2}",
                broker_name, stock_name, order.code, order.price, order.shares, gross_amount, fee,
                (realized_pnl * 100.0).round() / 100.0
            );
            Ok(OrderExecutionStatus::Filled { record })
        }
    }
}
