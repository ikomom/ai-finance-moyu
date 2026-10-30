//! Trading boundary rules, A-share market constraints (T+1, trading hours, lot sizes),
//! and today's PnL breakdown helpers.
//!
//! Split from `engine.rs` and `commands/portfolio.rs` to keep files <= 300 lines (AGENTS.md §11).

use super::types::{AssetClass, PortfolioPosition, TradeAction, TradeOrder, TradeRecord, TradeRecordStatus};

/// Compute available shares that can be sold today under A-share rules.
///
/// For stocks (`AssetClass::Stock`), A-share enforces T+1: shares bought today cannot be sold today.
/// For ETFs and Convertible Bonds, T+0 round-trip trading is allowed.
pub fn calculate_available_shares(
    pos: &PortfolioPosition,
    trades: &[TradeRecord],
    today: &str,
) -> u32 {
    let asset_class = AssetClass::from_code(&pos.code);
    match asset_class {
        AssetClass::Stock => {
            let today_bought: u32 = trades
                .iter()
                .filter(|t| {
                    t.broker_id == pos.broker_id
                        && t.code == pos.code
                        && t.action == TradeAction::Buy
                        && t.status == TradeRecordStatus::Filled
                        && t.timestamp.starts_with(today)
                })
                .map(|t| t.shares)
                .sum();
            pos.shares.saturating_sub(today_bought)
        }
        AssetClass::Etf | AssetClass::ConvertibleBond => pos.shares,
    }
}

/// Check if current time is within continuous trading hours.
pub fn is_trading_session_now() -> bool {
    let session = crate::market::session_at(crate::market::beijing_now());
    matches!(
        session,
        crate::market::Session::Morning
            | crate::market::Session::Afternoon
            | crate::market::Session::ClosingAuction
    )
}

/// Determine price limit percentage for A-share instrument.
pub fn get_price_limit_ratio(code: &str, name: Option<&str>) -> f64 {
    if let Some(n) = name {
        if n.to_ascii_uppercase().contains("ST") {
            return 0.05;
        }
    }
    let clean = code.trim().to_ascii_lowercase();
    let num_part = clean.trim_start_matches(|c: char| c.is_alphabetic());
    if num_part.starts_with("30") || num_part.starts_with("68") {
        0.20
    } else if clean.starts_with("bj") || num_part.starts_with("8") || num_part.starts_with("4") || num_part.starts_with("9") {
        0.30
    } else {
        0.10
    }
}

/// Validate order against A-share real trading boundaries.
pub fn validate_order_boundaries(
    order: &TradeOrder,
    existing_pos: Option<&PortfolioPosition>,
    trades: &[TradeRecord],
    pre_close: Option<f64>,
    strict_mode: bool,
) -> Result<(), String> {
    if !strict_mode {
        return Ok(());
    }

    // 1. Trading hours check
    if !is_trading_session_now() {
        return Err("当前处于非连续交易时段（连续交易时段为工作日 09:30-11:30, 13:00-15:00），无法撮合成交。如需非交易时间测试，可切换为自由沙盒模式。".into());
    }

    // 2. Buy lot size check (100-share integer multiple)
    if order.action == TradeAction::Buy && !order.shares.is_multiple_of(100) {
        return Err(format!(
            "买入数量必须为 100 股（1手）的整数倍，当前输入为 {} 股",
            order.shares
        ));
    }

    // 3. T+1 check on Sell for stocks
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    if order.action == TradeAction::Sell {
        if let Some(pos) = existing_pos {
            let asset_class = AssetClass::from_code(&order.code);
            if asset_class == AssetClass::Stock {
                let avail = calculate_available_shares(pos, trades, &today);
                if order.shares > avail {
                    let today_bought = pos.shares.saturating_sub(avail);
                    return Err(format!(
                        "A股股票实行 T+1 交易制度，当日买入的股票不可在当日卖出（今日已买入 {} 股，当前可用可卖仅 {} 股）。如需当日卖出，可切换为自由沙盒模式。",
                        today_bought, avail
                    ));
                }
            }
        }
    }

    // 4. Price limit check
    if let Some(pc) = pre_close {
        if pc > 0.0 {
            let ratio = get_price_limit_ratio(&order.code, order.name.as_deref());
            let upper = ((pc * (1.0 + ratio) * 100.0).round()) / 100.0;
            let lower = ((pc * (1.0 - ratio) * 100.0).round()) / 100.0;
            if order.price > upper + 0.001 || order.price < lower - 0.001 {
                return Err(format!(
                    "委托价格 ¥{:.2} 超出当日涨跌停限制（跌停价 ¥{:.2} ~ 涨停价 ¥{:.2}）",
                    order.price, lower, upper
                ));
            }

            // 5. Limit-board fillability checks
            if order.action == TradeAction::Sell && order.price <= lower + 0.001 {
                if let Some(ref bids) = order.bids {
                    let total_bids: f64 = bids.iter().map(|b| b.1).sum();
                    if total_bids <= 0.0 {
                        return Err("【流动性黑洞】该股跌停板封死且买盘接力枯竭（买盘挂单为 0），实盘中排队出逃无法撮合成交。如需强制测试，可切换为自由沙盒模式。".into());
                    }
                }
            } else if order.action == TradeAction::Buy && order.price >= upper - 0.001 {
                if let Some(ref asks) = order.asks {
                    let total_asks: f64 = asks.iter().map(|a| a.1).sum();
                    if total_asks <= 0.0 {
                        return Err("【流动性封锁】该股一字涨停抛盘枯竭（卖盘挂单为 0），散户无通道买入。如需强制测试，可切换为自由沙盒模式。".into());
                    }
                }
            }
        }
    }

    // 6. Order book depth limit on Buy (卖一50%法则)
    if order.action == TradeAction::Buy {
        if let Some(ref asks) = order.asks {
            if let Some(ask1) = asks.first() {
                let ask1_shares = (ask1.1 * 100.0).round() as u32;
                if ask1_shares > 0 {
                    let max_allowed = ((ask1_shares as f64) * 0.50).round() as u32;
                    let cap = ((max_allowed / 100) * 100).max(100);
                    if order.shares > cap {
                        return Err(format!(
                            "【盘口吃单深度受限】当前卖一挂单仅 {} 手（{} 股）。严格实盘模式下单笔委托上限不得超过对手盘深度的 50%（当前最大允许成交 {} 股），以防止严重滑点与冲击成本。如需大额吃单，可调小委托股数或切换为自由沙盒模式。",
                            ask1.1 as u32, ask1_shares, cap
                        ));
                    }
                }
            }
        }
    }

    Ok(())
}

/// Compute today's PnL for a single position view by decomposing overnight vs intraday shares.
pub fn compute_position_today_pnl(
    pos: &PortfolioPosition,
    trades: &[TradeRecord],
    current_price: f64,
    pre_close: f64,
    today_date: &str,
) -> f64 {
    let mut today_buy_shares: u32 = 0;
    let mut today_buy_cost = 0.0;
    let mut today_realized_pnl = 0.0;

    for t in trades {
        if t.broker_id == pos.broker_id
            && t.code == pos.code
            && t.status == TradeRecordStatus::Filled
            && t.timestamp.starts_with(today_date)
        {
            match t.action {
                TradeAction::Buy => {
                    today_buy_shares += t.shares;
                    today_buy_cost += t.amount + t.fee;
                }
                TradeAction::Sell => {
                    today_realized_pnl += t.realized_pnl.unwrap_or(0.0);
                }
            }
        }
    }

    let held_from_today = pos.shares.min(today_buy_shares);
    let held_overnight = pos.shares.saturating_sub(held_from_today);

    let overnight_pnl = (current_price - pre_close) * (held_overnight as f64);
    let today_buys_pnl = if today_buy_shares > 0 && held_from_today > 0 {
        let avg_cost = today_buy_cost / (today_buy_shares as f64);
        (current_price - avg_cost) * (held_from_today as f64)
    } else {
        0.0
    };

    overnight_pnl + today_buys_pnl + today_realized_pnl
}

/// Validate whether an order can be cancelled according to A-share real trading rules.
pub fn validate_cancel_order_boundaries(strict_mode: bool) -> Result<(), String> {
    if !strict_mode {
        return Ok(());
    }

    let now = crate::market::beijing_now();
    let session = crate::market::session_at(now);

    match session {
        crate::market::Session::CallAuctionLocked => Err(
            "【A股规则限制】09:20-09:24为早盘集合竞价不可撤单时段，交易所主机不接受撤单申报。如需强制撤单，可切换为自由沙盒模式。".into(),
        ),
        crate::market::Session::PreTrade => Err(
            "【A股规则限制】09:25-09:29为开盘撮合静默期，交易所主机不接受任何申报与撤单。如需强制撤单，可切换为自由沙盒模式。".into(),
        ),
        crate::market::Session::ClosingAuction => Err(
            "【A股规则限制】14:57-15:00为尾盘收盘集合竞价时段，交易所主机不接受撤单申报。如需强制撤单，可切换为自由沙盒模式。".into(),
        ),
        _ => Ok(()),
    }
}
