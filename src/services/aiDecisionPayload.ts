//! Feature extractor and payload builder for System-1 AI Decision Engine.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

import type { KLineData, Quote, Snapshot } from '../types'
import type { StockDecisionPayload } from '../types/aiDecision'
import { diagnoseStock } from '../utils/stockDiagnosis'

export function buildStockDecisionPayload(
  q: Quote,
  snap: Snapshot | null | undefined,
  kd?: KLineData | null | undefined,
  modeType: 'intraday' | 'kline' = 'intraday'
): StockDecisionPayload {
  const code = q.code
  const signal = snap?.trendSignals?.[code]
  const diag = diagnoseStock(q, signal)

  // 核心特征提取：支撑阻力距离、波段大趋势、大盘剪刀差
  const bars = kd?.bars
  const lastBar = bars && bars.length > 0 ? bars[bars.length - 1] : null
  const support = kd?.support ?? null
  const resistance = kd?.resistance ?? null
  const ma5 = lastBar?.ma5 ?? null
  const ma20 = lastBar?.ma20 ?? null
  const curPrice = q.price > 0 ? q.price : (lastBar?.close ?? 0)

  const supportDistPct =
    support && support > 0 && curPrice > 0 ? ((curPrice - support) / support) * 100 : null
  const resistDistPct =
    resistance && resistance > 0 && curPrice > 0 ? ((resistance - curPrice) / curPrice) * 100 : null
  const ma20DistPct =
    ma20 && ma20 > 0 && curPrice > 0 ? ((curPrice - ma20) / ma20) * 100 : null

  let waveTrend = '波段整理'
  if (ma20 && curPrice > 0) {
    if (curPrice >= ma20 * 0.99) {
      waveTrend = ma5 && curPrice < ma5 ? '波段多头回踩' : '波段多头向上'
    } else if (support && curPrice >= support * 0.99) {
      waveTrend = '波段箱体震荡'
    } else {
      waveTrend = '波段空头通道'
    }
  }

  let marketScissorsPct: number | null = null
  const indices = snap?.marketOverview?.indices
  if (indices && indices.length > 0) {
    const chinext = indices.find((i) => i.code === '399006' || i.name.includes('创业板'))
    const sh = indices.find((i) => i.code === '000001' || i.name.includes('上证'))
    if (chinext && sh) {
      marketScissorsPct = chinext.changePct - sh.changePct
    }
  }

  return {
    code,
    name: q.name || code,
    price: curPrice,
    changePct: q.changePct,
    vwapBias: signal?.biasPct ?? 0,
    activeBuyRatio: q.activeBuyRatio ?? null,
    bidAskImbalance: q.bidAskImbalance ?? null,
    spatialDesc: diag.spatialText,
    sectorDesc: `${diag.sectorText} (${diag.sectorRoleText})`,
    sectorStyle: diag.sectorRoleText,
    dailyMaDesc: ma5 && ma20 ? `MA5: ${ma5.toFixed(2)}, MA20: ${ma20.toFixed(2)}` : undefined,
    dailyKdjDesc: kd?.kdjStatus ?? (lastBar?.j != null ? `J值: ${lastBar.j.toFixed(0)}` : undefined),
    dailyLevelsDesc: support && resistance ? `支撑: ${support.toFixed(2)}, 阻力: ${resistance.toFixed(2)}` : undefined,
    supportDistPct,
    resistDistPct,
    ma20DistPct,
    waveTrend,
    marketScissorsPct,
    modeType,
  }
}
