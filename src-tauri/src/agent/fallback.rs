use serde_json::Value;
use crate::state::AppState;
use super::finance_tools::FinanceTools;

pub struct HeuristicFallbackEngine;

impl HeuristicFallbackEngine {
    /// 未配置 API Key 或网络离线时的确定性四象限金融决策卡片保底生成器
    pub fn generate_card(state: &AppState, symbol: &str) -> String {
        let snapshot_val = match FinanceTools::execute(state, "get_security_snapshot", &serde_json::json!({ "symbol": symbol })) {
            Ok(v) => v,
            Err(e) => {
                return format!(
                    "### ⚠️ 无法获取标的 [{}] 诊断信息\n\n\
> 原因: {}\n\n\
请检查股票代码是否在自选股列表中，或等待行情数据刷新。",
                    symbol, e
                );
            }
        };

        let risk_val = FinanceTools::execute(state, "calc_portfolio_risk", &serde_json::json!({ "symbol": symbol })).unwrap_or(Value::Null);
        let market_val = FinanceTools::execute(state, "get_market_breadth", &serde_json::json!({})).unwrap_or(Value::Null);

        Self::render_card_from_values(&snapshot_val, &risk_val, &market_val, symbol)
    }

    /// 根据各金融引擎的确定性数据渲染标准四象限金融决策卡片
    pub fn render_card_from_values(snapshot_val: &Value, risk_val: &Value, market_val: &Value, symbol: &str) -> String {
        let code = snapshot_val.get("code").and_then(|v| v.as_str()).unwrap_or(symbol);
        let name = snapshot_val.get("name").and_then(|v| v.as_str()).unwrap_or(symbol);
        let price = snapshot_val.get("current_price").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let pct = snapshot_val.get("change_pct").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let vwap = snapshot_val.get("vwap").and_then(|v| v.as_f64()).unwrap_or(price);
        let bias_pct = snapshot_val.get("vwap_bias_pct").and_then(|v| v.as_f64()).unwrap_or(0.0);

        let trend_state = snapshot_val
            .pointer("/trend_engine/state")
            .and_then(|v| v.as_str())
            .unwrap_or("暂无形态判定");
        // `Option`, not a defaulted 0: an absent signal must not read as a
        // genuine "perfectly balanced" score of zero.
        let score = snapshot_val.pointer("/trend_engine/score").and_then(|v| v.as_i64());
        let freshness = snapshot_val
            .get("data_freshness")
            .and_then(|v| v.as_str())
            .unwrap_or("missing");
        let data_age = snapshot_val
            .get("data_age_seconds")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let summary = snapshot_val
            .pointer("/trend_engine/summary")
            .and_then(|v| v.as_str())
            .unwrap_or("分时形态引擎尚未就绪");

        let levels = snapshot_val.get("deterministic_critical_levels");
        let r2 = levels.and_then(|l| l.get("r2_strong_resistance")).and_then(|v| v.as_f64()).unwrap_or(price * 1.03);
        let r1 = levels.and_then(|l| l.get("r1_short_resistance")).and_then(|v| v.as_f64()).unwrap_or(price * 1.015);
        let s1 = levels.and_then(|l| l.get("s1_short_support")).and_then(|v| v.as_f64()).unwrap_or(price * 0.985);
        let s2 = levels.and_then(|l| l.get("s2_strong_support")).and_then(|v| v.as_f64()).unwrap_or(price * 0.97);

        let pnl_pct = risk_val.get("floating_pnl_pct").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let pnl_amt = risk_val.get("floating_pnl_amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let cost_price = risk_val.get("cost_price").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let shares = risk_val.get("shares").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let is_under_water = risk_val.get("is_under_water").and_then(|v| v.as_bool()).unwrap_or(false);

        let market_status = market_val.get("status").and_then(|v| v.as_str()).unwrap_or("缩量震荡");

        // No score means the shape engine never ran. Labelling that "窄幅整理"
        // invents a conclusion the data does not support, so say so instead.
        let bias_tag = match score {
            None => "⚠️ 形态未判定 (分时数据尚未就绪)",
            Some(s) if s >= 40 => "🟢 稳步多头 (主力资金主动进场)",
            Some(s) if s >= 10 => "🟢 偏多上行 (维持分时均线上方震荡)",
            Some(s) if s <= -40 => "🔴 空头破位 (放量跌破分时生命线)",
            Some(s) if s <= -10 => "🔴 弱势承压 (均线受阻回落)",
            Some(_) => "⚪ 窄幅整理 (多空均势观望)",
        };

        let score_text = match score {
            Some(s) => format!("`{s}` / 100"),
            None => "**暂无评分**（分时形态引擎未产出）".to_string(),
        };

        // The score and the tape disagree in exactly the way that misleads:
        // a hard -50 next to +0.00% change is a stale snapshot being read as a
        // live one. Say so above the numbers rather than below them.
        let freshness_notice = match freshness {
            "live" => String::new(),
            "stale" => format!(
                "\n> ⚠️ **行情数据已过期约 {data_age} 秒**（轮询中断或网络异常）。以下评分基于旧快照，**不可作为当前盘面依据**。\n"
            ),
            _ => "\n> ⚠️ **未取到分时形态数据**，以下仅有静态报价信息，多空评分缺失。\n".to_string(),
        };

        format!(
            "# 📊 【标的诊断与操盘纪律卡】 {name} ({code})\n{freshness_notice}\n\
### 🧭 【多空定调】\n\
- **日内多空倾向**：{bias_tag}\n\
- **量化综合评分**：{score_text}（当前现价: `{price:.2}` 元, 涨跌幅: `{pct:+.2}%`）\n\
- **大盘量能环境**：当前市场处于 **{market_status}** 阶段（两市总成交额环比联动）\n\n\
---\n\n\
### 🔬 【微观盘口推演】\n\
- **分时量价形态**：{trend_state}\n\
- **均线偏离程度**：日内价格相对 VWAP 分时动态均价线乖离率为 `{bias_pct:+.2}%`\n\
- **核心逻辑归纳**：{summary}\n\n\
---\n\n\
### 📐 【关键点位测算】\n\
> *提示：以下关键点位由本地 Rust 金融引擎基于 VWAP 与日内极值确定性实时测算，杜绝计算幻觉。*\n\n\
| 维度 | 关键价位 | 距离现价 | 性质与战术意义 |\n\
| :--- | :--- | :--- | :--- |\n\
| **强阻力 (R2)** | `{r2:.2}` 元 | `+{r2_dist:.2}%` | 冲高减仓防守位 / 日内强压力线 |\n\
| **短阻力 (R1)** | `{r1:.2}` 元 | `+{r1_dist:.2}%` | 早盘突破上沿压力 |\n\
| **分水岭 (VWAP)** | `{vwap:.2}` 元 | `{vwap_dist:+.2}%` | **日内多空生命线**（线上看多，线下防守） |\n\
| **短支撑 (S1)** | `{s1:.2}` 元 | `-{s1_dist:.2}%` | 均价线回踩支撑企稳位 |\n\
| **强支撑 (S2)** | `{s2:.2}` 元 | `-{s2_dist:.2}%` | 日内底线防守位，破位需坚决减仓 |\n\n\
---\n\n\
### 🛡️ 【持仓与纪律核对】\n\
- **用户持仓基准**：持仓 `{shares:.0}` 股 @ 成本价 `{cost_price:.2}` 元\n\
- **浮动盈亏状态**：`{pnl_pct:+.2}%`（浮动盈亏: `{pnl_amt:+.2}` 元）\n\
- **风控纪律提示**：\n\
  - 成本线状态: {cost_status}\n\
  - 战术建议: {advice}\n\n\
> 💡 *本卡片由本地确定性量价规则计算生成，未经大模型推理。*",
            cost_status = if is_under_water { "⚠️ 处于成本线下方（被套状态，严禁无脑逆势盲目补仓）" } else if cost_price > 0.0 { "✅ 处于成本线上方（盈利保护中）" } else { "⚪ 未设置成本价" },
            advice = if is_under_water && score.unwrap_or(0) < 0 {
                "当前处于水下且形态偏弱，优先做好防守，等待触碰均价线分水岭反抽减亏，严守止损纪律！"
            } else if score.unwrap_or(0) >= 30 {
                "均价线支撑有效，多头趋势良性发展，可持股观察上方 R1 阻力位突破动能。"
            } else {
                "日内波动幅度温和，多空仍在平衡博弈，建议多看少动，耐心等待方向明朗。"
            },
            r2_dist = if price > 0.0 { ((r2 - price) / price * 100.0).max(0.0) } else { 0.0 },
            r1_dist = if price > 0.0 { ((r1 - price) / price * 100.0).max(0.0) } else { 0.0 },
            vwap_dist = if price > 0.0 { (vwap - price) / price * 100.0 } else { 0.0 },
            s1_dist = if price > 0.0 { ((price - s1) / price * 100.0).max(0.0) } else { 0.0 },
            s2_dist = if price > 0.0 { ((price - s2) / price * 100.0).max(0.0) } else { 0.0 },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fallback_generates_valid_4quadrant_card() {
        let snapshot = serde_json::json!({
            "code": "sh600519",
            "name": "贵州茅台",
            "current_price": 1600.0,
            "change_pct": 1.5,
            "vwap": 1590.0,
            "data_freshness": "live",
            "trend_engine": {
                "state": "▲ 放量拉升",
                "score": 45,
                "summary": "放量拉升突破"
            }
        });

        let card = HeuristicFallbackEngine::render_card_from_values(&snapshot, &serde_json::json!({}), &serde_json::json!({}), "sh600519");
        assert!(card.contains("【多空定调】"));
        assert!(card.contains("【微观盘口推演】"));
        assert!(card.contains("【关键点位测算】"));
        assert!(card.contains("【持仓与纪律核对】"));
        assert!(card.contains("贵州茅台"));
        assert!(!card.contains("数据已过期"), "live data must not carry a stale warning");
    }

    /// A missing score must not be silently rendered as a neutral 0 — that
    /// reads as "the engine judged this perfectly balanced".
    #[test]
    fn absent_score_is_reported_as_unavailable() {
        let snapshot = serde_json::json!({
            "code": "sh600519",
            "name": "贵州茅台",
            "current_price": 1600.0,
            "change_pct": 1.5,
            "vwap": 1590.0,
            "data_freshness": "missing",
            "trend_engine": { "state": "暂无形态判定" }
        });

        let card = HeuristicFallbackEngine::render_card_from_values(&snapshot, &serde_json::json!({}), &serde_json::json!({}), "sh600519");
        assert!(card.contains("暂无评分"));
        assert!(card.contains("未取到分时形态数据"));
        assert!(!card.contains("窄幅整理"), "must not invent a neutral verdict");
    }

    /// The regression from the report: a hard -50 next to +0.00% change was a
    /// stale snapshot presented as a live reading.
    #[test]
    fn stale_data_carries_a_warning_above_the_numbers() {
        let snapshot = serde_json::json!({
            "code": "sh600522",
            "name": "中天科技",
            "current_price": 26.62,
            "change_pct": 0.0,
            "vwap": 26.85,
            "data_freshness": "stale",
            "data_age_seconds": 95,
            "trend_engine": { "state": "▼ 反抽承压", "score": -50, "summary": "均线反压" }
        });

        let card = HeuristicFallbackEngine::render_card_from_values(&snapshot, &serde_json::json!({}), &serde_json::json!({}), "sh600522");
        assert!(card.contains("行情数据已过期"));
        assert!(card.contains("95 秒"));
        let warn_at = card.find("行情数据已过期").expect("warning present");
        let score_at = card.find("量化综合评分").expect("score present");
        assert!(warn_at < score_at, "the staleness warning must come before the score");
    }

    /// The Rust enum's Debug name must never reach the rendered card.
    #[test]
    fn no_raw_enum_names_leak_into_the_card() {
        let snapshot = serde_json::json!({
            "code": "sh600522",
            "name": "中天科技",
            "current_price": 26.62,
            "change_pct": 0.0,
            "vwap": 26.85,
            "data_freshness": "live",
            "trend_engine": { "state": "▼ 反抽承压", "score": -50, "summary": "均线反压" }
        });

        let card = HeuristicFallbackEngine::render_card_from_values(&snapshot, &serde_json::json!({}), &serde_json::json!({}), "sh600522");
        for leaked in ["VwapResistance", "BreakoutPullback", "Neutral\"", "SteadyBull"] {
            assert!(!card.contains(leaked), "`{leaked}` must not appear in user-facing output");
        }
    }
}

