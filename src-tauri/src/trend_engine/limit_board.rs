//! Limit board (封死涨停 / 封死跌停 / 跌停翘板 / 涨停炸板) priority pattern detection.
//!
//! Follows AGENTS.md §11 (dedicated isolated module, <=300 lines).

use crate::market::calculate_limit_prices;
use crate::quote::Quote;

use super::types::{TrendSignal, TrendState};

pub(super) fn detect_limit_board_pattern(
    quote: &Quote,
    price: f64,
    make_signal: &dyn Fn(TrendState, i32, String) -> TrendSignal,
) -> Option<TrendSignal> {
    let (limit_up, limit_down) = calculate_limit_prices(&quote.code, &quote.name, quote.pre_close)?;

    // 1. 跌停侧判定
    let is_at_limit_down = price <= limit_down + 0.005;
    let buy1_vol = quote.bids.first().map(|b| b.1).unwrap_or(0.0);
    let sell1_vol = quote.asks.first().map(|a| a.1).unwrap_or(0.0);
    // 买档真空判定：买一量为 0 或买盘为空，或失衡度极度负向（<= -0.90）
    let is_buy_empty = buy1_vol <= 0.001 || quote.bids.is_empty() || quote.bid_ask_imbalance <= -0.90;

    if is_at_limit_down && is_buy_empty {
        let seal_hands = sell1_vol;
        let seal_desc = if seal_hands >= 10000.0 {
            format!("{:.1}万手", seal_hands / 10000.0)
        } else if seal_hands > 0.0 {
            format!("{:.0}手", seal_hands)
        } else {
            "巨额".to_string()
        };
        return Some(make_signal(
            TrendState::SealedLimitDown,
            -100,
            format!(
                "已被空头巨量死封跌停（封单 {seal_desc}），买盘流动性枯竭无法即时成交；严禁伸手接飞刀，密切监控封单增减"
            ),
        ));
    }

    // 跌停翘板判定：日内曾触及跌停价，现价已脱离跌停价且跌幅收窄超 0.5%
    let hit_limit_down_today = quote.low > 0.0 && quote.low <= limit_down + 0.005;
    let limit_down_pct = (limit_down - quote.pre_close) / quote.pre_close * 100.0;
    if hit_limit_down_today && price > limit_down + 0.02 && quote.change_pct > limit_down_pct + 0.5 {
        return Some(make_signal(
            TrendState::BrokenLimitDown,
            -35,
            format!(
                "跌停板被巨量撬板资金撬开（现价 {:.2}，{:.2}%），多空换手博弈剧烈，持仓者密切跟踪承接择机自救",
                price, quote.change_pct
            ),
        ));
    }

    // 2. 涨停侧判定
    let is_at_limit_up = price >= limit_up - 0.005;
    // 卖档真空判定：卖一量为 0 或卖盘为空，或失衡度极度正向（>= 0.90）
    let is_sell_empty = sell1_vol <= 0.001 || quote.asks.is_empty() || quote.bid_ask_imbalance >= 0.90;

    if is_at_limit_up && is_sell_empty {
        let seal_hands = buy1_vol;
        let seal_desc = if seal_hands >= 10000.0 {
            format!("{:.1}万手", seal_hands / 10000.0)
        } else if seal_hands > 0.0 {
            format!("{:.0}手", seal_hands)
        } else {
            "巨额".to_string()
        };
        return Some(make_signal(
            TrendState::SealedLimitUp,
            100,
            format!(
                "多头主力牢牢封死涨停（封单 {seal_desc}），卖盘真空筹码坚固，享受强势溢价，持股待涨"
            ),
        ));
    }

    // 涨停炸板判定：日内曾触及涨停价，现价已跌落涨停价超 0.5%
    let hit_limit_up_today = quote.high > 0.0 && quote.high >= limit_up - 0.005;
    let limit_up_pct = (limit_up - quote.pre_close) / quote.pre_close * 100.0;
    if hit_limit_up_today && price < limit_up - 0.02 && quote.change_pct < limit_up_pct - 0.5 {
        return Some(make_signal(
            TrendState::BrokenLimitUp,
            30,
            format!(
                "涨停板被大单砸开炸板（现价 {:.2}，{:.2}%），高位筹码分歧松动，谨防主力获利兑现回落",
                price, quote.change_pct
            ),
        ));
    }

    None
}
