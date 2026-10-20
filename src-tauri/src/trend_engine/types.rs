//! Trend-engine value objects.
//!
//! Split from `mod.rs` to stay inside the 300-line budget (AGENTS.md §11).

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Qualitative state of the intraday volume-price structure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TrendState {
    /// 突破回踩：在分时均线上方运行，回踩均线获得支撑企稳
    BreakoutPullback,
    /// 放量拉升：成交量显著放大且价格向上突破
    VolumeSurge,
    /// 稳步多头：均线呈多头仰角，价格稳居均线上方
    SteadyBull,
    /// 顶背离：二次冲高逼近/突破前高但成交量显著衰竭
    TopDivergence,
    /// 放量破位：放量跌破分时均线，形态转弱
    Breakdown,
    /// 反抽承压：在均线下方运行，向上触碰均线受阻回落
    VwapResistance,
    /// 冲高乖离：日内大涨且短线急拉偏离均价线过远，乖离率高
    VwapOverbought,
    /// 探底乖离：日内大跌且短线急跌偏离均价线过远，乖离率负值大
    VwapOversold,
    /// 触底反弹：二次探底抛压衰竭或放量收复分时均线
    BottomRebound,
    /// 窄幅整理：价格紧贴均线窄幅震荡，成交量平稳
    Consolidation,
    /// 趋势平衡：多空相对平衡，无极端形态
    Neutral,
    /// 极值破底翻：跌破关键支撑诱空后迅速放量收回，主力洗盘诱空
    SpringRebound,
    /// 主动抢筹：买盘五档大幅积压且短线主动买盘占比高，多头强力进攻
    AggressiveBuying,
    /// 恐慌出逃：盘口抛压压顶且主动卖盘砸穿买档，空头恐慌出逃
    PanicDumping,
    /// 缩量阴跌：紧贴均价线下方持续阴跌，量能枯竭
    IlliquidDrift,
    /// 逆势抗跌：大盘或行业走弱但个股独立逆势走强，资金逆势承接
    IndependentAlpha,
    /// 独立下杀：大盘或行业稳定但个股放量单边下杀，脱离板块补跌
    SoloPlunge,
    /// ORB 向上突破：放量突破开盘15分钟区间高点
    OrbBreakoutUp,
    /// ORB 向下跌破：放量跌破开盘15分钟区间低点
    OrbBreakdownDown,
}

impl TrendState {
    pub fn label(self) -> &'static str {
        match self {
            TrendState::BreakoutPullback => "▲ 突破回踩",
            TrendState::VolumeSurge => "▲ 放量拉升",
            TrendState::SteadyBull => "▲ 稳步多头",
            TrendState::TopDivergence => "▼ 顶背离",
            TrendState::Breakdown => "▼ 放量破位",
            TrendState::VwapResistance => "▼ 反抽承压",
            TrendState::VwapOverbought => "⚡ 冲高乖离",
            TrendState::VwapOversold => "⚡ 探底乖离",
            TrendState::BottomRebound => "▲ 触底反弹",
            TrendState::Consolidation => "● 窄幅整理",
            TrendState::Neutral => "● 趋势平衡",
            TrendState::SpringRebound => "▲ 极值破底翻",
            TrendState::AggressiveBuying => "▲ 主动抢筹",
            TrendState::PanicDumping => "▼ 恐慌出逃",
            TrendState::IlliquidDrift => "● 缩量阴跌",
            TrendState::IndependentAlpha => "★ 逆势抗跌",
            TrendState::SoloPlunge => "▼ 独立下杀",
            TrendState::OrbBreakoutUp => "▲ ORB突破",
            TrendState::OrbBreakdownDown => "▼ ORB跌破",
        }
    }

    pub fn compact_label(self) -> &'static str {
        match self {
            TrendState::BreakoutPullback => "回踩",
            TrendState::VolumeSurge => "放量涨",
            TrendState::SteadyBull => "多头",
            TrendState::TopDivergence => "背离",
            TrendState::Breakdown => "放量跌",
            TrendState::VwapResistance => "承压",
            TrendState::VwapOverbought => "超买",
            TrendState::VwapOversold => "超跌",
            TrendState::BottomRebound => "反弹",
            TrendState::Consolidation => "整理",
            TrendState::Neutral => "平衡",
            TrendState::SpringRebound => "破底翻",
            TrendState::AggressiveBuying => "抢筹",
            TrendState::PanicDumping => "出逃",
            TrendState::IlliquidDrift => "阴跌",
            TrendState::IndependentAlpha => "抗跌",
            TrendState::SoloPlunge => "下杀",
            TrendState::OrbBreakoutUp => "突破",
            TrendState::OrbBreakdownDown => "跌破",
        }
    }
}

/// Analysis output produced by the Trend Engine.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrendSignal {
    pub state: TrendState,
    pub label: String,
    pub compact_label: String,
    pub score: i32,
    pub bias_pct: f64,
    pub summary: String,
    pub updated_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orb_high: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orb_low: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sector_linkage: Option<crate::market_overview::SectorLinkage>,
}

pub(super) fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

