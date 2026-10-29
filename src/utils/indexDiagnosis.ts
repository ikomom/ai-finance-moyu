import type { MarketOverview, Quote, TrendSignal } from '../types'
import { fmtTurnover, isIndexCode } from '../types'
import { extractStyle, type MarketStyleInfo } from './marketStyle'

export type { MarketStyleInfo }

export type DiagnosisTone = 'bull' | 'bear' | 'warn' | 'neutral'

export type DiagnosisCode =
  | 'BULL_SURGE'            // 放量共振全面普涨
  | 'BULL_NORMAL'           // 温和偏多走强
  | 'DIVERGE_INDEX_PUMP'    // 拉权护盘题材失血 (二八分化)
  | 'DIVERGE_BREADTH_PUMP'  // 题材活跃做个股 (八二行情)
  | 'VOLUME_SHORT_PUMP'     // 缩量冲高诱多风险
  | 'PANIC_DUMP'            // 放量恐慌大跌
  | 'HEAVY_DROP'            // 破位重挫
  | 'BLEEDING_DRIFT'        // 缩量阴跌缺乏承接
  | 'CONSOLIDATION'         // 多空对峙震荡蓄势
  | 'PENDING'               // 数据拉取中或休市

export interface IndexDiagnosis {
  code: DiagnosisCode
  badgeLabel: string       // Mini Header 外露标签，如 "🚨拉权护盘 (31%涨)"
  compactLabel: string     // List 自选行紧凑标签，如 "拉大票"
  tone: DiagnosisTone
  guidance: string         // 操盘指引，如 "【谨防诱多】"
  summary: string          // 一句话盘面实况解读
  upCount: number
  downCount: number
  flatCount: number
  upPct: number
  downPct: number
  totalTurnoverText: string
  turnoverDeltaText: string
  turnoverDeltaDetail: string
  isVolumeSurge: boolean
  styleInfo: MarketStyleInfo
  trendLabel: string
  trendSummary: string
  trendBiasText?: string
}

/**
 * A股指数五维大白话穿透诊断引擎 (diagnoseIndex).
 */
export function diagnoseIndex(
  quote?: Quote | null,
  overview?: MarketOverview | null,
  signal?: TrendSignal | null
): IndexDiagnosis {
  const code = quote?.code ?? ''
  const isIdx = isIndexCode(code)

  const up = overview?.upCount ?? 0
  const down = overview?.downCount ?? 0
  const flat = overview?.flatCount ?? 0
  const total = Math.max(1, up + down + flat)

  const upPct = Math.round((up / total) * 100)
  const downPct = Math.round((down / total) * 100)

  const turnoverPct = overview?.turnoverChangePct ?? 0
  const isVolumeSurge = turnoverPct >= 5.0
  const isVolumeShrink = turnoverPct <= -5.0

  const turnoverText = fmtTurnover(overview?.totalTurnover)
  const deltaText = (() => {
    if (overview?.turnoverChangeAmount == null || overview.turnoverChangeAmount === 0) {
      return '量能持平'
    }
    const amtStr = fmtTurnover(Math.abs(overview.turnoverChangeAmount))
    const tag = overview.turnoverChangeAmount > 0 ? '放量' : '缩量'
    return `${tag} ${amtStr}`
  })()
  const deltaDetail = (() => {
    if (overview?.turnoverChangeAmount == null || overview.turnoverChangeAmount === 0) {
      return '两市量能较昨日持平'
    }
    const sign = overview.turnoverChangeAmount > 0 ? '+' : ''
    const amtStr = fmtTurnover(Math.abs(overview.turnoverChangeAmount))
    const tag = overview.turnoverChangeAmount > 0 ? '放量' : '缩量'
    return `较昨日${tag} ${amtStr} (${sign}${turnoverPct.toFixed(1)}%)`
  })()

  const trendLabel = (() => {
    if (!signal) return '均线平稳'
    const raw = signal.label ? signal.label.replace(/^[●▲▼⚡★]\s*/, '') : '整理'
    const bias = signal.biasPct != null
      ? ` (${signal.biasPct > 0 ? '+' : ''}${signal.biasPct.toFixed(1)}%)`
      : ''
    return `${raw}${bias}`
  })()
  const trendSummary = signal?.summary ?? '分时价格贴合均线平稳运行，无显著异常乖离'

  const styleInfo = extractStyle(overview?.topSectors)

  const buildResult = (
    code: DiagnosisCode,
    badgeLabel: string,
    compactLabel: string,
    tone: DiagnosisTone,
    guidance: string,
    summary: string
  ): IndexDiagnosis => ({
    code,
    badgeLabel,
    compactLabel,
    tone,
    guidance,
    summary,
    upCount: up,
    downCount: down,
    flatCount: flat,
    upPct,
    downPct,
    totalTurnoverText: turnoverText,
    turnoverDeltaText: deltaText,
    turnoverDeltaDetail: deltaDetail,
    isVolumeSurge,
    styleInfo,
    trendLabel,
    trendSummary,
    trendBiasText: trendSummary,
  })

  // 兜底未加载或非指数标的
  if (!isIdx || !overview || total <= 10) {
    return buildResult(
      'PENDING',
      '● 大盘诊断中',
      '诊断中',
      'neutral',
      '【等待行情】',
      '全市场行情与情绪数据正在初始化更新…'
    )
  }

  const idxPct = quote?.changePct ?? 0

  // 1. 权重拉抬护盘 (指数微跌持平或红盘，但个股超6成下跌，二八失血严重)
  if (idxPct >= -0.05 && downPct >= 60) {
    return buildResult(
      'DIVERGE_INDEX_PUMP',
      `🚨拉权护盘 (${upPct}%涨)`,
      '拉大票',
      'warn',
      '【谨防诱多】',
      '指数靠大市值权重护盘推升，但全市场多数个股下挫，二八失血严重，赚指数不赚钱。'
    )
  }

  // 2. 八二行情题材火爆 (指数微绿或滞涨，但上涨个股超65%)
  if (idxPct <= 0.15 && upPct >= 65) {
    return buildResult(
      'DIVERGE_BREADTH_PUMP',
      `💎题材活跃 (${upPct}%涨)`,
      '做个股',
      'bull',
      '【轻指数重个股】',
      '大盘指数受权重压制失真，底层题材个股百花齐放，真实赚钱效应强劲。'
    )
  }

  // 3. 缩量冲高诱多 (指数明显反弹但两市缩量)
  if (idxPct > 0.3 && isVolumeShrink && upPct < 65) {
    return buildResult(
      'VOLUME_SHORT_PUMP',
      `⚠️缩量冲高 (${upPct}%涨)`,
      '缩量拉',
      'warn',
      '【切忌追高】',
      '指数缩量反弹后劲不足，多空存量博弈分歧加大，谨防午后乏力冲高回落。'
    )
  }

  // 4. 放量全面共振普涨
  if (idxPct >= 0.5 && isVolumeSurge && upPct >= 75) {
    return buildResult(
      'BULL_SURGE',
      `🔥放量共振 (${upPct}%涨)`,
      '共振普涨',
      'bull',
      '【顺势看多】',
      '两市真金白银放量进攻，超七成个股上涨，多头动能充沛，赚钱效应爆发。'
    )
  }

  // 5. 温和偏多走强
  if (upPct >= 60 && idxPct > 0) {
    return buildResult(
      'BULL_NORMAL',
      `📈偏多走强 (${upPct}%涨)`,
      '偏多走强',
      'bull',
      '【逢低布局】',
      '多头占据盘面主动，买盘有序推升，盘面赚钱效应良好。'
    )
  }

  // 6. 放量恐慌杀跌
  if (idxPct <= -0.8 && isVolumeSurge && downPct >= 75) {
    return buildResult(
      'PANIC_DUMP',
      `❄️放量恐慌 (${downPct}%跌)`,
      '恐慌砸盘',
      'bear',
      '【多看少动】',
      '放量大跌恐慌盘与止损盘涌出，非理性杀跌明显，切莫盲目伸手接飞刀。'
    )
  }

  // 7. 破位重挫 (指数跌幅深，个股普遍下挫)
  if (idxPct <= -1.0 && downPct >= 65) {
    return buildResult(
      'HEAVY_DROP',
      `⚡破位重挫 (${downPct}%跌)`,
      '重挫破位',
      'bear',
      '【防守避险】',
      '指数承压破位深跌，空头抛压沉重且个股普跌下挫，宜严格控制仓位规避风险。'
    )
  }

  // 8. 弱势阴跌无承接 (指数绿盘下跌，个股超6成下跌)
  if (idxPct < 0 && downPct >= 60) {
    return buildResult(
      'BLEEDING_DRIFT',
      `📉弱势阴跌 (${downPct}%跌)`,
      '弱势阴跌',
      'bear',
      '【防守控仓】',
      '市场买盘承接乏力，抛压占据主导，交投冷清弱势阴跌，宜以防守防御为主。'
    )
  }

  // 9. 默认多空对峙窄幅蓄势
  return buildResult(
    'CONSOLIDATION',
    `⚖️多空对峙 (${upPct}%涨)`,
    '窄幅震荡',
    'neutral',
    '【观望蓄势】',
    '涨跌家数参半，资金无序电风扇轮动，多空双方胶着，等待变盘方向确立。'
  )
}
