//! Broker account cash management and position reset actions.

use super::types::PortfolioData;

/// Reset single stock holding (close position and reclaim proceeds at specified or cost price).
pub fn reset_position(data: &mut PortfolioData, broker_id: &str, code: &str) -> Result<(), String> {
    let pos_idx = data
        .positions
        .iter()
        .position(|p| p.broker_id == broker_id && p.code == code)
        .ok_or_else(|| format!("未找到券商 {} 的持仓 {}", broker_id, code))?;

    data.positions.remove(pos_idx);
    Ok(())
}

/// Reset entire broker account: restore cash to initial capital, wipe all positions and trades.
pub fn reset_broker(data: &mut PortfolioData, broker_id: &str) -> Result<(), String> {
    let broker = data
        .brokers
        .iter_mut()
        .find(|b| b.id == broker_id)
        .ok_or_else(|| format!("未找到券商账户: {}", broker_id))?;

    broker.available_cash = broker.initial_cash;
    data.positions.retain(|p| p.broker_id != broker_id);
    data.trades.retain(|t| t.broker_id != broker_id);
    Ok(())
}

/// Transfer cash (deposit or withdraw) for a broker account.
pub fn transfer_cash(
    data: &mut PortfolioData,
    broker_id: &str,
    amount: f64,
    is_deposit: bool,
) -> Result<(), String> {
    if !amount.is_finite() || amount <= 0.0 {
        return Err("转账金额必须为大于 0 的有效数值".into());
    }
    let broker = data
        .brokers
        .iter_mut()
        .find(|b| b.id == broker_id)
        .ok_or_else(|| format!("未找到券商账户: {}", broker_id))?;

    if is_deposit {
        broker.available_cash = ((broker.available_cash + amount) * 100.0).round() / 100.0;
        broker.initial_cash = ((broker.initial_cash + amount) * 100.0).round() / 100.0;
    } else {
        if broker.available_cash < amount {
            return Err(format!(
                "可用现金不足: 当前可用 ¥{:.2}，拟转出 ¥{:.2}",
                broker.available_cash, amount
            ));
        }
        broker.available_cash = ((broker.available_cash - amount) * 100.0).round() / 100.0;
        broker.initial_cash = ((broker.initial_cash - amount).max(0.0) * 100.0).round() / 100.0;
    }
    Ok(())
}
