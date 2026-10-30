//! IPC commands for multi-broker portfolio simulation and trade execution.

use tauri::{AppHandle, Manager};

use crate::portfolio::{
    self, BrokerAccount, BrokerFeeConfig, ExecuteTradeResult, OrderExecutionStatus, PortfolioData,
    PortfolioSummary, TradeAction, TradeOrder,
};
use crate::state::AppState;

#[tauri::command]
pub async fn get_portfolio_summary(app: AppHandle) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    let mut portfolio_guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
    let expired = portfolio::expire_stale_pending_orders(&mut portfolio_guard);
    if expired > 0 {
        let _ = portfolio::storage::save(&app, &portfolio_guard);
    }
    let quotes_guard = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
    Ok(portfolio::compute_portfolio_summary(&portfolio_guard, &quotes_guard))
}

#[tauri::command]
pub async fn execute_simulated_trade(app: AppHandle, mut order: TradeOrder) -> Result<ExecuteTradeResult, String> {
    let state = app.state::<AppState>();
    {
        let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(q) = quotes.get(&order.code) {
            if order.pre_close.is_none() { order.pre_close = Some(q.pre_close); }
            if order.bids.is_none() && !q.bids.is_empty() { order.bids = Some(q.bids.clone()); }
            if order.asks.is_none() && !q.asks.is_empty() { order.asks = Some(q.asks.clone()); }
        }
    }

    let status = {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        let res = portfolio::execute_trade(&mut guard, order.clone())?;
        portfolio::storage::save(&app, &guard)?;
        res
    };

    let action_str = match order.action {
        TradeAction::Buy => "买入",
        TradeAction::Sell => "卖出",
    };

    let (status_str, message) = match status {
        OrderExecutionStatus::Filled { record } => {
            log::info!(
                target: "USER",
                "执行模拟{}成交: 标的={} {}, 数量={}股, 成交价=¥{:.2}, 金额=¥{:.2}, 手续费=¥{:.2}",
                action_str, record.name, record.code, record.shares, record.price, record.amount, record.fee
            );
            sync_watchlist_costs(&app, &state);
            ("filled".to_string(), format!("✓ {}成交成功！", action_str))
        }
        OrderExecutionStatus::Pending { order: pending } => {
            log::info!(
                target: "USER",
                "提交模拟{}挂单: 标的={} {}, 数量={}股, 委托价=¥{:.2} (排队撮合)",
                action_str, pending.name, pending.code, pending.shares, pending.price
            );
            crate::poller::emit_snapshot(&app);
            ("pending".to_string(), format!("✓ 限价{}单已挂出，排队撮合中", action_str))
        }
    };

    let summary = get_portfolio_summary(app).await?;
    Ok(ExecuteTradeResult { summary, status: status_str, message })
}

#[tauri::command]
pub async fn cancel_simulated_order(app: AppHandle, order_id: String) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        let order = portfolio::cancel_pending_order(&mut guard, &order_id)?;
        portfolio::storage::save(&app, &guard)?;
        log::info!(
            target: "USER",
            "撤销模拟挂单: 订单ID={}, 标的={} {}, 股数={}",
            order_id, order.code, order.name, order.shares
        );
    }
    crate::poller::emit_snapshot(&app);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn cancel_all_simulated_orders(
    app: AppHandle,
    broker_id: Option<String>,
) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        let cancelled = portfolio::cancel_all_pending_orders(&mut guard, broker_id.as_deref())?;
        portfolio::storage::save(&app, &guard)?;
        log::info!(
            target: "USER",
            "批量撤销模拟挂单: 券商={:?}, 共撤销 {} 笔挂单并全额解冻资金/持仓",
            broker_id,
            cancelled.len()
        );
    }
    crate::poller::emit_snapshot(&app);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn set_portfolio_strict_mode(app: AppHandle, strict_mode: bool) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        guard.strict_mode = strict_mode;
        portfolio::storage::save(&app, &guard)?;
    }
    log::info!(target: "USER", "切换模拟账本模式: 严格实盘={}", strict_mode);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn clear_all_portfolio(app: AppHandle) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        *guard = PortfolioData::default();
        portfolio::storage::save(&app, &guard)?;
    }
    {
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        for item in cfg.watchlist.iter_mut() {
            item.cost_price = None;
            item.shares = None;
        }
        let _ = crate::config::save(&app, &cfg);
    }
    log::info!(target: "USER", "清空全部模拟账本及成交流水");
    crate::poller::emit_snapshot(&app);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn create_broker_account(
    app: AppHandle,
    name: String,
    initial_cash: f64,
    fee_config: Option<BrokerFeeConfig>,
) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        let id = format!("broker_{}", chrono::Local::now().timestamp_millis());
        let mut account = BrokerAccount::new(&id, name.clone(), initial_cash);
        let preset_name = fee_config.as_ref().map(|c| c.preset.clone()).unwrap_or_else(|| "vip_low".into());
        if let Some(cfg) = fee_config {
            account.fee_config = cfg;
        }

        guard.brokers.push(account.clone());
        guard.active_broker_id = Some(id);
        portfolio::storage::save(&app, &guard)?;
        log::info!(
            target: "USER",
            "新建模拟券商账户: 名称={}, 初始本金=¥{:.2}, 费率模板={}",
            name, initial_cash, preset_name
        );
    }
    sync_watchlist_costs(&app, &state);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn update_broker_account(app: AppHandle, broker: BrokerAccount) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(existing) = guard.brokers.iter_mut().find(|b| b.id == broker.id) {
            existing.name = broker.name.clone();
            if broker.available_cash >= 0.0 { existing.available_cash = (broker.available_cash * 100.0).round() / 100.0; }
            if broker.initial_cash > 0.0 { existing.initial_cash = (broker.initial_cash * 100.0).round() / 100.0; }
            existing.fee_config = broker.fee_config.clone();
        } else {
            return Err(format!("未找到券商账户: {}", broker.id));
        }
        portfolio::storage::save(&app, &guard)?;
        log::info!(
            target: "USER",
            "修改模拟券商配置: 名称={}, 初始本金=¥{:.2}, 可用资金=¥{:.2}, 费率={}",
            broker.name, broker.initial_cash, broker.available_cash, broker.fee_config.preset
        );
    }
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn transfer_broker_cash(
    app: AppHandle,
    broker_id: String,
    amount: f64,
    is_deposit: bool,
) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        portfolio::transfer_cash(&mut guard, &broker_id, amount, is_deposit)?;
        portfolio::storage::save(&app, &guard)?;
        let action_name = if is_deposit { "资金转入(追加)" } else { "资金转出(提取)" };
        log::info!(target: "USER", "模拟账户{}: 券商ID={}, 金额=¥{:.2}", action_name, broker_id, amount);
    }
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn delete_broker_account(app: AppHandle, broker_id: String) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        guard.brokers.retain(|b| b.id != broker_id);
        guard.positions.retain(|p| p.broker_id != broker_id);
        guard.trades.retain(|t| t.broker_id != broker_id);

        if guard.active_broker_id.as_deref() == Some(&broker_id) {
            guard.active_broker_id = guard.brokers.first().map(|b| b.id.clone());
        }
        portfolio::storage::save(&app, &guard)?;
        log::info!(target: "USER", "删除模拟券商账户: 券商ID={}", broker_id);
    }
    sync_watchlist_costs(&app, &state);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn reset_broker_account(app: AppHandle, broker_id: String) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        portfolio::reset_broker(&mut guard, &broker_id)?;
        portfolio::storage::save(&app, &guard)?;
        log::info!(target: "USER", "重置模拟券商账户: 券商ID={}", broker_id);
    }
    sync_watchlist_costs(&app, &state);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn reset_portfolio_position(app: AppHandle, broker_id: String, code: String) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        portfolio::reset_position(&mut guard, &broker_id, &code)?;
        portfolio::storage::save(&app, &guard)?;
        log::info!(target: "USER", "清空单只模拟持仓: 券商ID={}, 标的代码={}", broker_id, code);
    }
    sync_watchlist_costs(&app, &state);
    get_portfolio_summary(app).await
}

#[tauri::command]
pub async fn set_active_broker(app: AppHandle, broker_id: String) -> Result<PortfolioSummary, String> {
    let state = app.state::<AppState>();
    {
        let mut guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        if guard.brokers.iter().any(|b| b.id == broker_id) {
            guard.active_broker_id = Some(broker_id.clone());
            portfolio::storage::save(&app, &guard)?;
            log::info!(target: "USER", "切换当前模拟券商为: ID={}", broker_id);
        } else {
            return Err(format!("券商账户不存在: {}", broker_id));
        }
    }
    sync_watchlist_costs(&app, &state);
    get_portfolio_summary(app).await
}

pub(crate) fn sync_watchlist_costs(app: &AppHandle, state: &AppState) {
    {
        let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
        let guard = state.portfolio.lock().unwrap_or_else(|e| e.into_inner());
        let active_id = guard.active_broker_id.as_deref().unwrap_or_default();
        for item in cfg.watchlist.iter_mut() {
            if let Some(pos) = guard.positions.iter().find(|p| p.broker_id == active_id && p.code == item.code) {
                item.cost_price = Some(pos.cost_price);
                item.shares = Some(pos.shares as f64);
            } else if guard.positions.iter().any(|p| p.code == item.code)
                || guard.trades.iter().any(|t| t.code == item.code)
            {
                item.cost_price = None;
                item.shares = None;
            }
        }
        let _ = crate::config::save(app, &cfg);
    }
    crate::poller::emit_snapshot(app);
}
