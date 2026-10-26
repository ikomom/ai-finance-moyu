//! Decision API router executing local vs online requests.

use std::time::Instant;
use reqwest::Client;
use serde_json::json;

use super::types::{AiDecisionConfig, AiDecisionMode, StockDecisionPayload, StockDecisionResult};

pub async fn execute_decision(
    config: &AiDecisionConfig,
    payload: StockDecisionPayload,
) -> Result<StockDecisionResult, String> {
    let start = Instant::now();
    let (url, auth_header, model_name, mode_str) = match config.mode {
        AiDecisionMode::Disabled => return Err("AI 决策功能当前已关闭".into()),
        AiDecisionMode::Local => {
            let port = config.local_port;
            (
                format!("http://127.0.0.1:{port}/decide"),
                None,
                config.local_model_id.clone(),
                "local",
            )
        }
        AiDecisionMode::Online => {
            let endpoint = config
                .online_endpoint
                .as_deref()
                .unwrap_or("https://openrouter.ai/api/alpha/decisions");
            let key = config
                .online_api_key
                .as_deref()
                .ok_or_else(|| "线上模式未配置 API Key，请在设置中保存".to_string())?;
            (
                endpoint.to_string(),
                Some(format!("Bearer {key}")),
                config.online_model.clone(),
                "online",
            )
        }
    };

    log::info!(
        target: "AI",
        "发起个股决策请求: {} ({}) -> 模式={}, 端点={}",
        payload.name,
        payload.code,
        mode_str,
        url
    );

    let sector_style_tag = payload
        .sector_style
        .as_deref()
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            crate::trend_engine::classify_sector_style(&payload.code, &payload.sector_desc)
                .label_zh()
                .to_string()
        });

    let state_obj = json!({
        "stock": format!("{} ({})", payload.name, payload.code),
        "price": payload.price,
        "changePct": format!("{:+.2}%", payload.change_pct),
        "vwapBias": format!("{:+.2}%", payload.vwap_bias),
        "activeBuyRatio": payload.active_buy_ratio.map(|r| format!("{:.0}%", r * 100.0)).unwrap_or_else(|| "--".into()),
        "bidAskImbalance": payload.bid_ask_imbalance.map(|i| format!("{:+.0}%", i * 100.0)).unwrap_or_else(|| "--".into()),
        "spatial": payload.spatial_desc,
        "sector": payload.sector_desc,
        "dailyMa": payload.daily_ma_desc.as_deref().unwrap_or("未载入"),
        "dailyKdj": payload.daily_kdj_desc.as_deref().unwrap_or("未载入"),
        "dailyLevels": payload.daily_levels_desc.as_deref().unwrap_or("未载入"),
        "sectorStyle": sector_style_tag,
        "supportDistPct": payload.support_dist_pct,
        "resistDistPct": payload.resist_dist_pct,
        "ma20DistPct": payload.ma20_dist_pct,
        "waveTrend": payload.wave_trend.as_deref().unwrap_or("波段整理"),
        "marketScissorsPct": payload.market_scissors_pct,
        "modeType": payload.mode_type.as_deref().unwrap_or("intraday"),
    });

    let questions = json!({
        "is_fake_pump": {
            "type": "noul",
            "instructions": "判定当前个股的盘中冲高/拉升是否存在主力虚拉骗线、诱多出货的嫌疑",
            "criteria": {
                "true": "存在明显诱多出货/主力骗线特征",
                "false": "属于真实买盘资金推升"
            }
        },
        "trade_action": {
            "type": "choice",
            "instructions": "评估当前股票的最优操盘决断方针",
            "criteria": {
                "take_profit": "逢高止盈 / 冲高落袋",
                "hold": "顺势持股 / 待涨",
                "wait": "观望防守 / 暂不追高",
                "stop_loss": "严格止损 / 减仓规避",
                "buy": "顺势做多 / 逢低吸纳",
                "oversold_bounce": "超跌反弹 / 低吸博弈",
                "support_test": "考验支撑 / 观察企稳"
            }
        },
        "market_attribution": {
            "type": "choice",
            "instructions": "分析该股日内异动的深层归因",
            "criteria": {
                "sector_rotation_bleed": "科技成长放量吸血，权重避险资金分流",
                "defensive_hedge": "大盘分化下的防守抱团护盘",
                "market_drag": "受全市场情绪疲软或大盘失血拖累",
                "sector_sync": "属于板块主线行情协同推升",
                "solo_diverge": "脱离大盘与板块的个股独立资金博弈"
            }
        }
    });

    let body = json!({
        "model": model_name,
        "state": state_obj,
        "questions": questions
    });

    let client = Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("构造 HTTP 客户端失败: {e}"))?;

    let mut req_builder = client.post(&url).json(&body);
    if let Some(auth) = auth_header {
        req_builder = req_builder.header("Authorization", auth);
    }

    let resp = req_builder
        .send()
        .await
        .map_err(|e| format!("请求决策端点失败 ({url}): {e}"))?;

    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("读取决策响应失败: {e}"))?;

    if !status.is_success() {
        let sample: String = text.chars().take(120).collect();
        let msg = format!("决策服务返回错误 (HTTP {status}): {sample}");
        log::error!(target: "AI", "{msg}");
        return Err(msg);
    }

    let json_val: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("解析决策 JSON 响应失败: {e} (原响应: {text})"))?;

    let latency_ms = start.elapsed().as_millis() as u64;

    // Parse answers
    let answers = json_val.get("answers").unwrap_or(&json_val);

    // 1. is_fake_pump & intent analysis
    let fake_prob = answers
        .get("is_fake_pump")
        .and_then(|v| v.get("noul").or_else(|| v.get("confidence")))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.2);

    let is_falling = payload.change_pct < -0.3 || payload.vwap_bias < -0.3;
    let is_rising = payload.change_pct > 0.3 || payload.vwap_bias > 0.3;

    let fake_label = if is_falling {
        if fake_prob >= 0.65 {
            format!("{:.0}% (虚砸洗盘 · 诱空嫌疑)", fake_prob * 100.0)
        } else {
            format!("{:.0}% (真实破位 · 空头压制)", fake_prob * 100.0)
        }
    } else if is_rising {
        if fake_prob >= 0.65 {
            format!("{:.0}% (虚拉骗线 · 谨防诱多)", fake_prob * 100.0)
        } else {
            format!("{:.0}% (健康买盘 · 真实推升)", fake_prob * 100.0)
        }
    } else {
        format!("{:.0}% (多空均衡 · 窄幅震荡)", fake_prob * 100.0)
    };

    // 2. trade_action without nested brackets
    let action_str = answers
        .get("trade_action")
        .and_then(|v| v.get("choice").or_else(|| v.as_str().map(|_| &json_val)))
        .and_then(|v| v.as_str())
        .unwrap_or("hold");
    let action_conf = answers
        .get("trade_action")
        .and_then(|v| v.get("confidence"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.85);
    let action_label = match action_str {
        "take_profit" => "逢高止盈",
        "hold" => "顺势持股",
        "wait" => "观望防守",
        "stop_loss" => "严格止损",
        "buy" => "顺势做多",
        "oversold_bounce" => "超跌反弹",
        "support_test" => "考验支撑",
        "sealed_limit_down" => "观望封单",
        "broken_limit_down" => "资金博弈",
        "sealed_limit_up" => "顺势持股",
        "broken_limit_up" => "逢高减仓",
        _ => "观望防守",
    };

    // 3. market_attribution
    let attr_str = answers
        .get("market_attribution")
        .and_then(|v| v.get("choice"))
        .and_then(|v| v.as_str())
        .unwrap_or("sector_sync");
    let attr_label = match attr_str {
        "sector_rotation_bleed" => "科技分流抽血",
        "defensive_hedge" => "防守抱团护盘",
        "market_drag" => "受大盘弱势拖累",
        "sector_sync" => "板块主线共振推升",
        "solo_diverge" => "个股独立资金博弈",
        _ => "跟随大盘轮动",
    };

    let raw_summary = if let Some(s) = answers.get("summary").and_then(|v| v.as_str()) {
        s.to_string()
    } else {
        synthesize_tactical_summary(&payload, action_label, attr_label, fake_prob)
    };

    let result = StockDecisionResult {
        code: payload.code.clone(),
        mode: mode_str.to_string(),
        is_fake_pump: fake_prob,
        is_fake_pump_label: fake_label,
        action: action_str.to_string(),
        action_label: action_label.to_string(),
        action_confidence: action_conf,
        attribution: attr_str.to_string(),
        attribution_label: attr_label.to_string(),
        latency_ms,
        model_name,
        raw_summary,
    };

    log::info!(
        target: "AI",
        "个股决策完成: {} ({}) | 动作={} | 诱多嫌疑={:.0}% | 归因={} | 耗时={}ms",
        payload.code,
        payload.name,
        result.action_label,
        result.is_fake_pump * 100.0,
        result.attribution_label,
        latency_ms
    );

    Ok(result)
}

fn synthesize_tactical_summary(
    p: &StockDecisionPayload,
    act: &str,
    attr: &str,
    fake_prob: f64,
) -> String {
    let wave = p.wave_trend.as_deref().unwrap_or("波段整理");
    let sup_note = match p.support_dist_pct {
        Some(d) if (0.0..=2.2).contains(&d) => format!("逼近5日强支撑(现价差{d:.1}%)，"),
        Some(d) if d < -1.0 => format!("已破位5日支撑(跌破{d:.1}%)，"),
        _ => String::new(),
    };
    let imb_note = match p.bid_ask_imbalance {
        Some(i) if i >= 0.12 => format!("盘口买盘开始承接(+{:.0}%)，", i * 100.0),
        Some(i) if i <= -0.15 => format!("盘口卖单压制明显({:.0}%)，", i * 100.0),
        _ => String::new(),
    };
    let trap_warn = if fake_prob >= 0.70 { "诱多嫌疑显著；" } else { "" };

    if act == "观望封单" {
        return "死封跌停流动性枯竭；严禁盲目接飞刀，重点跟踪封单消耗与撬板动向。".into();
    }
    if act == "资金博弈" {
        return "跌停板被撬开多空换手博弈；持仓者借反弹择机自救控仓，未持仓切忌追进。".into();
    }
    if act == "考验支撑" || act == "超跌反弹" {
        format!("{wave}。{attr}；{sup_note}{imb_note}重点观察企稳反抽动能，不宜盲目杀跌。")
    } else if act == "逢高止盈" {
        format!("{act}。{}冲高，{trap_warn}逼近阻力位，建议逢高分批兑现。", p.name)
    } else if act == "严格止损" {
        format!("{act}。{attr}；{sup_note}波段转弱，严守纪律防守控仓。")
    } else if act == "顺势做多" || act == "顺势持股" {
        format!("{act}。{wave}，{attr}；买盘稳固，顺势持股待涨。")
    } else {
        format!("{act}。{wave}，{attr}；{sup_note}{imb_note}结合大盘动态控仓。")
    }
}
