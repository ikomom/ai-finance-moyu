import type { DayTrend, KLineData, KlinePeriod, Quote } from '../../types'

export interface HistoricalTapeParams {
  quote: Quote
  drillDay: DayTrend
  kline?: KLineData | null
  klinePeriod?: KlinePeriod
}

export interface TapeDisplayData {
  quote: Quote
  historicalDate: string | null
}

function normDateKey(raw: string): string {
  return raw.replace(/-/g, '').slice(0, 8)
}

function formatDateLabel(raw: string): string {
  const key = normDateKey(raw)
  if (key.length === 8) {
    return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`
  }
  return raw
}

/**
 * Derive an accurate historical Quote snapshot for `MicroTapePopover` when
 * drilling down into a past trading day, stripping live-only order-book fields.
 */
export function buildHistoricalTapeQuote(params: HistoricalTapeParams): TapeDisplayData {
  const { quote, drillDay, kline, klinePeriod } = params
  const dateKey = normDateKey(drillDay.date)
  const pts = drillDay.points ?? []
  const firstPt = pts[0]
  const lastPt = pts.length > 0 ? pts[pts.length - 1] : undefined

  const canUseDailyKline = (!klinePeriod || klinePeriod === 'day') && Boolean(kline?.bars?.length)
  const bars = canUseDailyKline ? kline!.bars : []
  const barIdx = bars.findIndex((b) => normDateKey(b.date) === dateKey)
  const dayBar = barIdx >= 0 ? bars[barIdx] : undefined

  let high = 0
  let low = 0
  for (const p of pts) {
    if (p.price <= 0) continue
    if (high === 0 || p.price > high) high = p.price
    if (low === 0 || p.price < low) low = p.price
  }
  if (high === 0 && dayBar && dayBar.high > 0) high = dayBar.high
  if (low === 0 && dayBar && dayBar.low > 0) low = dayBar.low

  const open = (dayBar && dayBar.open > 0 ? dayBar.open : firstPt?.price) ?? 0
  const close = (lastPt && lastPt.price > 0 ? lastPt.price : dayBar?.close) ?? 0
  const preClose = drillDay.preClose > 0 ? drillDay.preClose : quote.preClose
  const change = preClose > 0 && close > 0 ? close - preClose : 0
  const changePct = preClose > 0 && close > 0 ? (change / preClose) * 100 : 0

  const volume = lastPt && lastPt.cumVolume > 0 ? lastPt.cumVolume : (dayBar?.volume ?? 0)
  const amount = lastPt && lastPt.cumAmount > 0 ? lastPt.cumAmount : undefined
  const avgPrice =
    lastPt && lastPt.avgPrice > 0
      ? lastPt.avgPrice
      : lastPt && lastPt.cumVolume > 0 && lastPt.cumAmount > 0
        ? lastPt.cumAmount / (lastPt.cumVolume * 100)
        : undefined
  const amplitude =
    high > 0 && low > 0 && preClose > 0 ? ((high - low) / preClose) * 100 : undefined

  const liveRefPrice = quote.price > 0 ? quote.price : quote.preClose
  let turnoverRate: number | undefined
  let circulatingMarketCap = quote.circulatingMarketCap
  if (quote.circulatingMarketCap && quote.circulatingMarketCap > 0 && liveRefPrice > 0) {
    const circulatingShares = (quote.circulatingMarketCap * 1e8) / liveRefPrice
    if (circulatingShares > 0) {
      if (volume > 0) {
        turnoverRate = ((volume * 100) / circulatingShares) * 100
      }
      if (close > 0) {
        circulatingMarketCap = (circulatingShares * close) / 1e8
      }
    }
  }

  let volumeRatio: number | undefined
  if (barIdx >= 5 && volume > 0) {
    const prev5 = bars.slice(barIdx - 5, barIdx)
    const avg5 = prev5.reduce((sum, b) => sum + b.volume, 0) / 5
    volumeRatio = avg5 > 0 && volume > 0 ? volume / avg5 : undefined
  }

  return {
    historicalDate: formatDateLabel(drillDay.date),
    quote: {
      ...quote,
      price: close,
      preClose,
      open,
      high,
      low,
      volume,
      change,
      changePct,
      date: dateKey,
      time: lastPt ? String(lastPt.time).padStart(4, '0') : '1500',
      bids: [],
      asks: [],
      outerVol: 0,
      innerVol: 0,
      bidAskImbalance: 0,
      activeBuyRatio: 0.5,
      turnoverRate,
      amount,
      amplitude,
      circulatingMarketCap,
      volumeRatio,
      weibi: undefined,
      weicha: undefined,
      avgPrice,
    },
  }
}

/** Return historical tape data when `drillDay` is active, otherwise the live quote. */
export function resolveTapeDisplay(params: {
  quote: Quote
  drillDay?: DayTrend | null
  kline?: KLineData | null
  klinePeriod?: KlinePeriod
}): TapeDisplayData {
  if (!params.drillDay) {
    return { quote: params.quote, historicalDate: null }
  }
  return buildHistoricalTapeQuote({
    quote: params.quote,
    drillDay: params.drillDay,
    kline: params.kline,
    klinePeriod: params.klinePeriod,
  })
}
