use serde_json::{json, Value};
use crate::state::AppState;

pub struct FinanceTools;

impl FinanceTools {
    /// Quotes older than this are reported as stale.
    ///
    /// The poller refreshes every 5s while the market is open, so 20s means
    /// three consecutive failures. Feeding the model a price it cannot see the
    /// age of is how a stale snapshot ends up presented as a live reading —
    /// the engine will happily score `+0.00%` change as a genuine flat tape.
    const STALE_AFTER_SECS: u64 = 20;

    pub fn get_tool_definitions() -> Value {
        json!([
            {
                "type": "function",
                "function": {
                    "name": "get_security_snapshot",
                    "description": "获取指定A股标的的实时确定性快照，包括分时报价、VWAP动态均价线、20种量价趋势状态、竞价多空意向与关键阻力/支撑点位，严禁自行推算指标。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "symbol": { "type": "string", "description": "标准A股证券代码，如 'sh600000', 'sz000001', '600519'" }
                        },
                        "required": ["symbol"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "calc_portfolio_risk",
                    "description": "计算标的在当前持仓成本与持股数下的精确浮动盈亏、回撤幅度及止损/止盈阈值触发状态。若未显式传参则自动读取用户自选股配置。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "symbol": { "type": "string", "description": "标准A股代码" },
                            "cost_price": { "type": "number", "description": "持仓买入均价（可选，未填则取自选配置）" },
                            "shares": { "type": "number", "description": "持仓股数（可选，未填则取自选配置）" }
                        },
                        "required": ["symbol"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_market_breadth",
                    "description": "获取全市场大盘宏观全景，包含涨跌平家数、两市总成交额及环比昨日放缩量比例（严格合规，不含已停止发布的实时北向资金）。",
                    "parameters": { "type": "object", "properties": {} }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "get_intraday_anomalies",
                    "description": "获取指定个股日内盘中异动监测状态，包含日内最高/最低极值、振幅及接近涨跌停警戒状态。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "symbol": { "type": "string", "description": "标准A股代码" }
                        },
                        "required": ["symbol"]
                    }
                }
            }
        ])
    }

    /// 规范化代码为匹配 keys 的格式
    fn normalize_code(raw: &str) -> String {
        let trimmed = raw.trim();
        if trimmed.starts_with("sh") || trimmed.starts_with("sz") || trimmed.starts_with("bj") {
            trimmed.to_string()
        } else if trimmed.starts_with('6') || trimmed.starts_with('9') {
            format!("sh{}", trimmed)
        } else if trimmed.starts_with('0') || trimmed.starts_with('3') {
            format!("sz{}", trimmed)
        } else if trimmed.starts_with('8') || trimmed.starts_with('4') {
            format!("bj{}", trimmed)
        } else {
            trimmed.to_string()
        }
    }

    pub fn execute(state: &AppState, name: &str, args: &Value) -> Result<Value, String> {
        match name {
            "get_security_snapshot" => {
                let raw_sym = args.get("symbol").and_then(|v| v.as_str()).ok_or("缺少 symbol 参数")?;
                let code = Self::normalize_code(raw_sym);

                let quotes = state.quotes.lock().map_err(|e| e.to_string())?;
                let quote = quotes.get(&code).ok_or_else(|| format!("未找到标的 {} 行情数据，请确认代码是否正确", code))?;

                let trends = state.trends.lock().map_err(|e| e.to_string())?;
                let trend = trends.get(&code);
                let latest_pt = trend.and_then(|t| t.points.last());
                let vwap = latest_pt.map(|p| p.avg_price).unwrap_or(quote.price);
                let turnover_amount = latest_pt.map(|p| p.cum_amount).unwrap_or(0.0);

                let trend_signals = state.trend_signals.lock().map_err(|e| e.to_string())?;
                let signal = trend_signals.get(&code);

                let auctions = state.auction_tracker.lock().map_err(|e| e.to_string())?;
                let auction = auctions.data.get(&code);
                let diag = auction.and_then(|a| a.diagnosis.as_ref());

                let bias_pct = if vwap > 0.0 { ((quote.price - vwap) / vwap) * 100.0 } else { 0.0 };

                let r2 = (quote.price * 1.03).max(quote.high);
                let r1 = (quote.price * 1.015).max(vwap * 1.01);
                let s1 = (quote.price * 0.985).min(vwap * 0.99);
                let s2 = (quote.price * 0.97).min(quote.low);

                // Age of the analysis the score is derived from. A stale signal
                // still produces a hard number, so the number alone must never
                // be presented without its age.
                let (age_secs, freshness) = match signal.map(|s| s.updated_at) {
                    Some(updated_at) => {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        let age = now.saturating_sub(updated_at);
                        let state = if age > Self::STALE_AFTER_SECS { "stale" } else { "live" };
                        (age, state)
                    }
                    None => (0, "missing"),
                };

                Ok(json!({
                    "code": quote.code,
                    "name": quote.name,
                    "data_freshness": freshness,
                    "data_age_seconds": age_secs,
                    "quote_timestamp": quote.time,
                    "current_price": quote.price,
                    "change_pct": quote.change_pct,
                    "high": quote.high,
                    "low": quote.low,
                    "open": quote.open,
                    "pre_close": quote.pre_close,
                    "vwap": (vwap * 100.0).round() / 100.0,
                    "vwap_bias_pct": (bias_pct * 100.0).round() / 100.0,
                    "turnover_amount": turnover_amount,
                    "trend_engine": {
                        // `label()`, never `{:?}`: the Debug name of the Rust
                        // enum ("VwapResistance") used to reach the model and
                        // then the user verbatim. The model reasons in prose;
                        // an internal type name is noise at best.
                        "state": signal.map(|s| s.state.label().to_string()).unwrap_or_else(|| "暂无形态判定".to_string()),
                        "state_code": signal.map(|s| format!("{:?}", s.state)),
                        "score": signal.map(|s| s.score),
                        "summary": signal.map(|s| s.summary.clone())
                    },
                    "auction_diagnosis": {
                        "tag": diag.map(|d| format!("{:?}", d.tag)).unwrap_or_else(|| "Normal".to_string()),
                        "early_peak_pct": diag.map(|d| d.early_peak_pct),
                        "locked_pct": diag.map(|d| d.locked_pct),
                        "volume_drop_pct": diag.and_then(|d| d.volume_drop_pct)
                    },
                    "deterministic_critical_levels": {
                        "r2_strong_resistance": (r2 * 100.0).round() / 100.0,
                        "r1_short_resistance": (r1 * 100.0).round() / 100.0,
                        "vwap_watershed": (vwap * 100.0).round() / 100.0,
                        "s1_short_support": (s1 * 100.0).round() / 100.0,
                        "s2_strong_support": (s2 * 100.0).round() / 100.0
                    }
                }))
            },

            "calc_portfolio_risk" => {
                let raw_sym = args.get("symbol").and_then(|v| v.as_str()).ok_or("缺少 symbol 参数")?;
                let code = Self::normalize_code(raw_sym);

                // LOCK ORDER (see `state.rs`): `quotes` must be released before
                // `config` is taken. `poller::poll_quotes` takes them in the
                // config→quotes order, so holding `quotes` while waiting for
                // `config` deadlocks the whole app. Clone out and drop.
                let quote = {
                    let quotes = state.quotes.lock().map_err(|e| e.to_string())?;
                    quotes.get(&code).cloned()
                }
                .ok_or_else(|| format!("未找到标的 {} 行情数据", code))?;

                // 若未传参，从本地 config.watchlist 中检索配置
                let (cost_price, shares) = {
                    let mut cp = args.get("cost_price").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let mut sh = args.get("shares").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    if cp <= 0.0 || sh <= 0.0 {
                        if let Ok(cfg) = state.config.lock() {
                            if let Some(item) = cfg.watchlist.iter().find(|w| w.code == code) {
                                if cp <= 0.0 { cp = item.cost_price.unwrap_or(0.0); }
                                if sh <= 0.0 { sh = item.shares.unwrap_or(0.0); }
                            }
                        }
                    }
                    (cp, sh)
                };

                let floating_pnl_amount = (quote.price - cost_price) * shares;
                let floating_pnl_pct = if cost_price > 0.0 {
                    ((quote.price - cost_price) / cost_price) * 100.0
                } else {
                    0.0
                };
                let drawdown_from_high_pct = if quote.high > 0.0 {
                    ((quote.price - quote.high) / quote.high) * 100.0
                } else {
                    0.0
                };

                Ok(json!({
                    "symbol": code,
                    "name": quote.name,
                    "current_price": quote.price,
                    "cost_price": cost_price,
                    "shares": shares,
                    "market_value": (quote.price * shares * 100.0).round() / 100.0,
                    "floating_pnl_amount": (floating_pnl_amount * 100.0).round() / 100.0,
                    "floating_pnl_pct": (floating_pnl_pct * 100.0).round() / 100.0,
                    "is_under_water": quote.price < cost_price && cost_price > 0.0,
                    "drawdown_from_high_pct": (drawdown_from_high_pct * 100.0).round() / 100.0
                }))
            },

            "get_market_breadth" => {
                let overview_lock = state.market_overview.lock().map_err(|e| e.to_string())?;
                if let Some(ref mo) = *overview_lock {
                    Ok(json!({
                        "up_count": mo.up_count,
                        "down_count": mo.down_count,
                        "flat_count": mo.flat_count,
                        "total_turnover": mo.total_turnover,
                        "turnover_change_pct": mo.turnover_change_pct.unwrap_or(0.0),
                        "status": if mo.turnover_change_pct.unwrap_or(0.0) > 0.0 { "增量放量" } else { "缩量震荡" },
                        "north_flow_note": "依交易所政策，盘中实时北向资金已停止公布，聚焦两市总成交额"
                    }))
                } else {
                    Ok(json!({
                        "up_count": 0,
                        "down_count": 0,
                        "flat_count": 0,
                        "status": "处于非交易时段或大盘全景基准缓存加载中"
                    }))
                }
            },

            "get_intraday_anomalies" => {
                let raw_sym = args.get("symbol").and_then(|v| v.as_str()).ok_or("缺少 symbol 参数")?;
                let code = Self::normalize_code(raw_sym);

                let quotes = state.quotes.lock().map_err(|e| e.to_string())?;
                let quote = quotes.get(&code).ok_or_else(|| format!("未找到标的 {} 行情数据", code))?;

                let amplitude = if quote.pre_close > 0.0 {
                    ((quote.high - quote.low) / quote.pre_close) * 100.0
                } else {
                    0.0
                };

                Ok(json!({
                    "symbol": code,
                    "name": quote.name,
                    "current_price": quote.price,
                    "session_high": quote.high,
                    "session_low": quote.low,
                    "amplitude_pct": (amplitude * 100.0).round() / 100.0,
                    "is_at_high": (quote.price - quote.high).abs() < 0.01,
                    "is_at_low": (quote.price - quote.low).abs() < 0.01
                }))
            },

            _ => Err(format!("未识别的金融工具指令: {}", name)),
        }
    }
}
