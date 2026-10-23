import type { Quote, TrendSignal, TrendState } from '../types'

export type StockDiagnosisTone = 'bull' | 'bear' | 'warn' | 'neutral'

export interface StockDiagnosis {
  badgeLabel: string       // Mini Header 外露标签，如 "▲ 稳步多头 · 可持股"
  compactLabel: string     // List 自选行紧凑标签，如 "多头(持)"
  tone: StockDiagnosisTone
  guidance: string         // 操盘指引，如 "【顺势持股】"
  actionSummary: string    // 一句话实战大白话解读
  score: number            // 多空博弈能量分 (-100 ~ +100)
  scoreLabel: string       // 如 "多头主导 (+45)"
  scoreBarPct: number      // 0 ~ 50% 居中双向能量条宽度
  isPositiveScore: boolean // 是否偏多
  vwapStatusText: string   // 如 "站稳均线 (+0.6%)"
  vwapTone: StockDiagnosisTone
  imbalanceText: string    // 如 "买盘占优 (+28%)"
  imbalanceTone: StockDiagnosisTone
  activeBuyText: string    // 如 "62% (主力扫单)"
  activeBuyTone: StockDiagnosisTone
  spatialText: string      // 如 "突破早盘高点 18.50"
  spatialTone: StockDiagnosisTone
  sectorText: string       // 如 "半导体 (+2.8%)"
  sectorRoleText: string   // 如 "领涨核心 · 超额 +1.4%"
  sectorTone: StockDiagnosisTone
  leaderText?: string      // 如 "板块龙头: 中芯国际 (+4.5%)"
}

type PatternTuple = [
  prefix: string,
  action: string,
  compact: string,
  guidance: string,
  summary: string,
  tone: StockDiagnosisTone,
]

const PATTERN_RULES: Record<TrendState, PatternTuple> = {
  steadyBull: ['▲ 稳步多头', '可持股', '多头(持)', '【顺势持股】', '股价依托分时均线稳步上推，买盘有序承接，多头趋势健康，持股待涨。', 'bull'],
  volumeSurge: ['🔥 放量拉升', '顺势看多', '放量(多)', '【放量突破】', '放量脉冲拉升，多头资金入场扫盘进攻，注意观察分时均线支撑有效性。', 'bull'],
  breakoutPullback: ['▲ 突破回踩', '看支撑', '回踩(蓄)', '【回踩蓄势】', '突破早盘压力后良性回踩均线，若均线承接有力可择机低吸布局。', 'bull'],
  orbBreakoutUp: ['▲ ORB突破', '顺势做多', '突破(追)', '【突破向上】', '成功冲破早盘博弈箱体高点，日内多头动能充沛，可顺势跟踪。', 'bull'],
  aggressiveBuying: ['⚡ 主动抢筹', '买盘坚决', '抢筹(强)', '【主力抢筹】', '盘口大单连续主动扫盘吃单，主力做多意图明确，资金博弈强势。', 'bull'],
  bottomRebound: ['▲ 触底反弹', '企稳反弹', '反弹(察)', '【触底反弹】', '探底后买盘逐步回流，出现企稳反抽迹象，留意能否有效收复分时均线。', 'bull'],
  springRebound: ['▲ 破底翻转', '假摔翻多', '破底翻', '【破底翻转】', '快速下砸跌破关键支撑后被迅速拉回，空头诱空失败，超跌修复反弹。', 'bull'],
  independentAlpha: ['★ 逆势抗跌', '抗跌独立', '抗跌(强)', '【逆势走强】', '走出独立抗跌或逆势走强行情，个股资金关注度高，防守韧性较强。', 'bull'],
  vwapOverbought: ['⚡ 冲高乖离', '慎盲追高', '乖离(慎)', '【慎盲追高】', '短线急冲正向乖离过大，远离日内成本线，谨防获利盘兑现冲高回落。', 'warn'],
  topDivergence: ['▼ 顶背离', '谨防回落', '背离(防)', '【谨防回落】', '价格刷出新高但量能与动能衰竭顶背离，谨防高位假突破引发分时跳水。', 'warn'],
  vwapResistance: ['▼ 反抽承压', '逢高控仓', '承压(减)', '【逢高减仓】', '反抽触及分时均线受阻回落，均线形成明显抛压阻力，宜逢高控仓。', 'bear'],
  breakdown: ['❄️ 放量破位', '严守止损', '破位(止)', '【防守止损】', '放量跌破分时均线与日内支撑位，破位下行风险加剧，严格执行止损纪律。', 'bear'],
  panicDumping: ['▼ 恐慌出逃', '避险离场', '砸盘(避)', '【防守止损】', '大单主动砸盘抛售，恐慌盘与止损盘涌出，切莫盲目伸手接飞刀。', 'bear'],
  soloPlunge: ['▼ 独立下杀', '避险减仓', '下杀(避)', '【多看少动】', '脱离板块与大盘独立下杀走弱，卖压沉重，防范进一步阴跌风险。', 'bear'],
  orbBreakdownDown: ['▼ ORB跌破', '跌破箱体', '跌破(减)', '【逢高减仓】', '跌破早盘博弈箱体下沿，早盘承接筹码全部套牢，短线防御为主。', 'bear'],
  illiquidDrift: ['● 缩量阴跌', '缺乏承接', '阴跌(看)', '【多看少动】', '交投冷清买盘承接无力，分时呈现无序阴跌漂移，缺乏主力资金关注。', 'bear'],
  vwapOversold: ['⚡ 探底乖离', '超跌待反抽', '超跌(待)', '【超跌待反抽】', '分时下探斜率过陡，负向偏离过大，短线有反抽修复均线需求，切勿杀跌。', 'warn'],
  consolidation: ['● 窄幅整理', '观望蓄势', '整理(看)', '【观望蓄势】', '价格贴合均价线窄幅震荡，量能平稳，多空胶着对峙，等待变盘方向。', 'neutral'],
  neutral: ['● 趋势平衡', '观望蓄势', '平衡(看)', '【观望蓄势】', '分时走势均衡平稳，多空力量相对参半，等待主力资金明确放量表态。', 'neutral'],
}

/**
 * A股个股专属五维实战穿透诊断引擎 (diagnoseStock).
 */
export function diagnoseStock(
  quote?: Quote | null,
  signal?: TrendSignal | null
): StockDiagnosis {
  const state = signal?.state ?? 'neutral'
  const [prefix, action, compact, guidance, defaultSummary, tone] =
    PATTERN_RULES[state] ?? PATTERN_RULES.neutral

  const badgeLabel = `${prefix} · ${action}`
  const compactLabel = compact
  const actionSummary = signal?.summary || defaultSummary

  // 1. VWAP 均线偏离
  const biasPct = signal?.biasPct ?? 0
  const biasSign = biasPct > 0 ? '+' : ''
  const vwapStatusText = biasPct >= 0.5
    ? `站稳均线 (${biasSign}${biasPct.toFixed(1)}%)`
    : biasPct <= -0.5
    ? `均线下破 (${biasSign}${biasPct.toFixed(1)}%)`
    : `均线平稳 (${biasSign}${biasPct.toFixed(1)}%)`
  const vwapTone: StockDiagnosisTone = biasPct >= 0.5 ? 'bull' : biasPct <= -0.5 ? 'bear' : 'neutral'

  // 2. 盘口买卖失衡
  const imb = quote?.bidAskImbalance ?? 0
  const imbPct = Math.round(imb * 100)
  const imbalanceText = imbPct >= 12
    ? `买盘占优 (+${imbPct}%)`
    : imbPct <= -12
    ? `压盘沉重 (${imbPct}%)`
    : `买卖均衡 (${imbPct >= 0 ? '+' : ''}${imbPct}%)`
  const imbalanceTone: StockDiagnosisTone = imbPct >= 12 ? 'bull' : imbPct <= -12 ? 'bear' : 'neutral'

  // 3. 主动买盘占比
  const activeRatio = quote?.activeBuyRatio
  const activePct = activeRatio != null && activeRatio > 0 ? Math.round(activeRatio * 100) : 50
  const activeBuyText = activePct >= 55
    ? `${activePct}% (主动扫单)`
    : activePct <= 45
    ? `${activePct}% (大单抛盘)`
    : `${activePct}% (势均力敌)`
  const activeBuyTone: StockDiagnosisTone = activePct >= 55 ? 'bull' : activePct <= 45 ? 'bear' : 'neutral'

  // 4. 空间位置与早盘箱体
  let spatialText = '分时震荡中'
  let spatialTone: StockDiagnosisTone = 'neutral'
  if (signal?.orbHigh != null && signal?.orbLow != null && quote?.price) {
    if (quote.price > signal.orbHigh) {
      spatialText = `突破早盘高点 ${signal.orbHigh.toFixed(2)}`
      spatialTone = 'bull'
    } else if (quote.price < signal.orbLow) {
      spatialText = `跌破早盘低点 ${signal.orbLow.toFixed(2)}`
      spatialTone = 'bear'
    } else {
      spatialText = `早盘箱体内 (${signal.orbLow.toFixed(2)}~${signal.orbHigh.toFixed(2)})`
      spatialTone = 'neutral'
    }
  } else if (quote?.high && quote?.price && quote.high > 0) {
    const distHigh = ((quote.high - quote.price) / quote.price) * 100
    spatialText = `距日内高点 ${distHigh.toFixed(1)}%`
  }

  // 5. 板块联动与龙头地位
  const sec = signal?.sectorLinkage
  const sectorText = sec
    ? sec.sectorCode.startsWith('ind_')
      ? `${sec.sectorName}板块`
      : `${sec.sectorName} (${sec.sectorChangePct >= 0 ? '+' : ''}${sec.sectorChangePct.toFixed(1)}%)`
    : '大盘防御避险'
  const sectorRoleText = sec
    ? `${sec.role}${sec.deltaRSector != null && !sec.sectorCode.startsWith('ind_') ? ` · 超额 ${sec.deltaRSector >= 0 ? '+' : ''}${sec.deltaRSector.toFixed(1)}%` : ''}`
    : '大盘权重轮动'
  const sectorTone: StockDiagnosisTone = sec
    ? sec.sectorChangePct >= 0 ? 'bull' : 'bear'
    : 'neutral'
  const leaderText = sec?.leaderName
    ? `板块龙头: ${sec.leaderName} (${sec.leaderChangePct >= 0 ? '+' : ''}${sec.leaderChangePct.toFixed(1)}%)`
    : undefined

  // 6. 居中双向能量条
  const score = signal?.score ?? 0
  const clamped = Math.max(-100, Math.min(100, score))
  const isPositiveScore = clamped >= 0
  const scoreBarPct = Math.round((Math.abs(clamped) / 100) * 50)
  const scoreLabel = clamped > 0
    ? `多头主导 (+${clamped})`
    : clamped < 0
    ? `空头压制 (${clamped})`
    : `多空均衡 (0)`

  return {
    badgeLabel,
    compactLabel,
    tone,
    guidance,
    actionSummary,
    score: clamped,
    scoreLabel,
    scoreBarPct,
    isPositiveScore,
    vwapStatusText,
    vwapTone,
    imbalanceText,
    imbalanceTone,
    activeBuyText,
    activeBuyTone,
    spatialText,
    spatialTone,
    sectorText,
    sectorRoleText,
    sectorTone,
    leaderText,
  }
}
