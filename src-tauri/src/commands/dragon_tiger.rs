//! IPC commands for Dragon & Tiger list and community sentiment.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::State;

use crate::dragon_tiger::{MarketDragonTigerOverview, StockDetailInfo};
use crate::state::AppState;

static LAST_LOGGED_STOCKS: Mutex<Option<HashMap<String, Instant>>> = Mutex::new(None);

#[tauri::command]
pub async fn get_stock_dragon_tiger(
    state: State<'_, AppState>,
    code: String,
) -> Result<StockDetailInfo, String> {
    let norm_code = crate::market::normalize_code(&code).unwrap_or(code);
    let stock_name = {
        let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
        quotes.get(&norm_code).map(|q| q.name.clone())
    };

    // 节流审计留痕：10 秒内同一股票仅打印一次，既保证业务审计留痕，又避免徽标与高频刷新造成刷屏
    let should_log = {
        let mut guard = LAST_LOGGED_STOCKS.lock().unwrap_or_else(|e| e.into_inner());
        let map = guard.get_or_insert_with(HashMap::new);
        let now = Instant::now();
        if let Some(prev) = map.get(&norm_code) {
            if now.duration_since(*prev) < Duration::from_secs(10) {
                false
            } else {
                map.insert(norm_code.clone(), now);
                true
            }
        } else {
            map.insert(norm_code.clone(), now);
            true
        }
    };

    if should_log {
        log::info!(
            target: "USER",
            "查看个股龙虎榜席位: {} ({})",
            norm_code,
            stock_name.as_deref().unwrap_or("--")
        );
    }

    Ok(state
        .dragon_tiger_client
        .fetch_stock_detail(&norm_code, stock_name.as_deref())
        .await)
}

#[tauri::command]
pub async fn get_market_dragon_tiger(
    state: State<'_, AppState>,
) -> Result<MarketDragonTigerOverview, String> {
    log::info!(target: "USER", "查看全市场龙虎游资榜");
    Ok(state.dragon_tiger_client.fetch_market_overview().await)
}

#[tauri::command]
pub async fn get_seat_dragon_tiger(
    state: State<'_, AppState>,
    branch_name: String,
    trade_date: Option<String>,
) -> Result<crate::dragon_tiger::SeatDetailInfo, String> {
    log::info!(target: "USER", "下钻查看游资席位操盘: {}", branch_name);
    Ok(state
        .dragon_tiger_client
        .fetch_seat_detail(&branch_name, trade_date.as_deref())
        .await)
}
