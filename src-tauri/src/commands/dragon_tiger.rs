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
    if crate::market::is_index(&norm_code) {
        return Ok(StockDetailInfo {
            code: norm_code,
            dragon_tiger: None,
        });
    }
    let stock_name = {
        let quotes = state.quotes.lock().unwrap_or_else(|e| e.into_inner());
        quotes.get(&norm_code).map(|q| q.name.clone())
    };

    let detail = state
        .dragon_tiger_client
        .fetch_stock_detail(&norm_code, stock_name.as_deref())
        .await;

    // 节流审计留痕：10 秒内同一股票仅打印一次，避免高频刷新造成刷屏
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
        if let Some(ref dt) = detail.dragon_tiger {
            let famous: Vec<&str> = dt
                .top_buyers
                .iter()
                .chain(dt.top_sellers.iter())
                .filter_map(|s| s.trader_label.as_deref())
                .collect();
            let famous_str = if famous.is_empty() {
                "无知名席位".to_string()
            } else {
                famous.join(", ")
            };
            log::info!(
                target: "ALERT",
                "【龙虎榜明细】查阅 {}({}) 披露日: {}, 机构净买: {:+.2}万, 龙虎净额: {:+.2}万, 现身资金: [{}]",
                dt.name,
                dt.code,
                dt.trade_date,
                dt.institution_net / 10000.0,
                dt.net_total / 10000.0,
                famous_str
            );
        } else {
            log::info!(
                target: "USER",
                "查阅个股龙虎榜: {} ({}), 近期未上榜",
                norm_code,
                stock_name.as_deref().unwrap_or("--")
            );
        }
    }

    Ok(detail)
}

#[tauri::command]
pub async fn get_market_dragon_tiger(
    state: State<'_, AppState>,
) -> Result<MarketDragonTigerOverview, String> {
    let res = state.dragon_tiger_client.fetch_market_overview().await;
    log::info!(
        target: "USER",
        "【大盘龙虎榜】查看全市场龙虎游资榜, 披露日: {}, 机构抢筹前列: {} 只, 游资异动: {} 笔",
        res.trade_date,
        res.top_institution_stocks.len(),
        res.famous_trader_moves.len()
    );
    Ok(res)
}

#[tauri::command]
pub async fn get_seat_dragon_tiger(
    state: State<'_, AppState>,
    branch_name: String,
    trade_date: Option<String>,
) -> Result<crate::dragon_tiger::SeatDetailInfo, String> {
    let detail = state
        .dragon_tiger_client
        .fetch_seat_detail(&branch_name, trade_date.as_deref())
        .await;
    let label = detail.trader_label.as_deref().unwrap_or("主力席位");
    log::info!(
        target: "ALERT",
        "【席位操盘】下钻查看 [{}] ({}), 同日上榜: {} 只标的, 历史沉淀: {} 笔记录",
        label,
        branch_name,
        detail.same_day_operations.len(),
        detail.historical_operations.len()
    );
    Ok(detail)
}

#[tauri::command]
pub async fn get_seat_radar(
    state: State<'_, AppState>,
    branches: Vec<String>,
    trade_date: Option<String>,
) -> Result<crate::dragon_tiger::SeatRadarResult, String> {
    log::info!(
        target: "USER",
        "【席位雷达】发起多席位筛选, 监控席位数: {}, 指定日期: {:?}",
        branches.len(),
        trade_date
    );
    Ok(state
        .dragon_tiger_client
        .fetch_seat_radar(&branches, trade_date.as_deref())
        .await)
}

#[tauri::command]
pub fn get_custom_seats(
    state: State<'_, AppState>,
) -> Result<Vec<crate::dragon_tiger::CustomSeatMapping>, String> {
    let cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    Ok(cfg.custom_seats.clone())
}

#[tauri::command]
pub fn save_custom_seats(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    seats: Vec<crate::dragon_tiger::CustomSeatMapping>,
) -> Result<(), String> {
    log::info!(
        target: "USER",
        "【席位关注】更新龙虎席位关注池, 共配置 {} 个营业部马甲映射",
        seats.len()
    );
    let mut cfg = state.config.lock().unwrap_or_else(|e| e.into_inner());
    cfg.custom_seats = seats;
    let res = crate::config::save(&app, &cfg).map_err(|e| format!("保存配置失败: {e}"));
    if res.is_ok() {
        use tauri::Emitter;
        let _ = app.emit("custom-seats-updated", ());
    }
    res
}
