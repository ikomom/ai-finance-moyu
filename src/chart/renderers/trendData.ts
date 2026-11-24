import type { AuctionPoint, TrendPoint } from '../../types'
import {
  isValidAvg,
  PRETRADE_SLOT_END,
  slotOf,
  slotOfFullTrend,
} from '../scale'
import type { DrawOptions } from '../types'
import type { UnifiedVolumeItem } from './volumeRenderer'

export interface UnifiedPricePoint {
  slot: number
  price: number
  avgPrice?: number
  isAuction?: boolean
  timeStr?: string
  auctionPoint?: AuctionPoint
  trendPoint?: TrendPoint
}

/**
 * Determines whether to display the full 09:15-15:00 unified auction spectrum (255 slots)
 * or gracefully fall back to the standard 09:30-15:00 session (240 slots).
 *
 * Rules:
 * 1. Global securities always use standard scale.
 * 2. If morning call auction data has been recorded (>= 1 points), activate full spectrum.
 * 3. If currently in the morning auction / pre-trade window (09:15 - 09:30), activate full spectrum.
 * 4. Otherwise (intraday cold start or post-market with no morning cache), fall back to standard session.
 */
export function isFullSpectrumActive(opts: DrawOptions): boolean {
  if (opts.isGlobal) return false
  const auctionPts = opts.auction?.points ?? []
  if (auctionPts.length >= 2) return true
  const now = new Date()
  const hhmm = now.getHours() * 100 + now.getMinutes()
  return hhmm >= 915 && hhmm < 930
}

export function computeUnifiedMaxDev(
  points: ReadonlyArray<TrendPoint>,
  preClose: number,
  opts: DrawOptions
): number {
  let maxDev = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.price > 0) {
      maxDev = Math.max(maxDev, Math.abs(p.price - preClose))
    }
    if (isValidAvg(p.avgPrice, preClose)) {
      maxDev = Math.max(maxDev, Math.abs(p.avgPrice - preClose))
    }
  }

  // Include real-time lastPrice in deviation bounds
  if (opts.lastPrice && opts.lastPrice > 0 && preClose > 0) {
    maxDev = Math.max(maxDev, Math.abs(opts.lastPrice - preClose))
  }

  // Include call auction points in deviation bounds
  if (opts.auction?.points) {
    for (const p of opts.auction.points) {
      if (p.price > 0) {
        maxDev = Math.max(maxDev, Math.abs(p.price - preClose))
      }
    }
  }
  if (opts.auction?.closingPoints) {
    for (const p of opts.auction.closingPoints) {
      if (p.price > 0) {
        maxDev = Math.max(maxDev, Math.abs(p.price - preClose))
      }
    }
  }

  if (preClose > 0) {
    maxDev = Math.max(maxDev, preClose * 0.002)
    for (const pl of opts.priceLines ?? []) {
      if (pl.price > 0 && Math.abs(pl.price - preClose) <= maxDev * 1.5) {
        maxDev = Math.max(maxDev, Math.abs(pl.price - preClose))
      }
    }
    if (opts.costPrice && opts.costPrice > 0 && Math.abs(opts.costPrice - preClose) <= maxDev * 1.5) {
      maxDev = Math.max(maxDev, Math.abs(opts.costPrice - preClose))
    }
    if (opts.orbHigh && opts.orbHigh > 0 && Math.abs(opts.orbHigh - preClose) <= maxDev * 1.5) {
      maxDev = Math.max(maxDev, Math.abs(opts.orbHigh - preClose))
    }
    if (opts.orbLow && opts.orbLow > 0 && Math.abs(opts.orbLow - preClose) <= maxDev * 1.5) {
      maxDev = Math.max(maxDev, Math.abs(opts.orbLow - preClose))
    }
  } else {
    maxDev = Math.max(maxDev, 1)
  }
  return maxDev
}

export function buildUnifiedChartData(
  opts: DrawOptions,
  xOf: (slot: number) => number,
  useFullSpectrum = false
): {
  pricePoints: UnifiedPricePoint[]
  volumeItems: UnifiedVolumeItem[]
} {
  const isGlobal = opts.isGlobal ?? false
  const pricePoints: UnifiedPricePoint[] = []
  const volumeItems: UnifiedVolumeItem[] = []
  const preClose = opts.preClose || opts.trend?.preClose || 0

  const isStaleTrend = Boolean(
    opts.auction?.date &&
    opts.trend?.date &&
    opts.trend.date < opts.auction.date
  )
  const trendPts = isStaleTrend ? [] : (opts.trend?.points ?? [])

  // 1. Morning Call Auction Points (09:15 - 09:25) — only in full spectrum mode
  const auctionPts = opts.auction?.points ?? []
  if (useFullSpectrum && !isGlobal && auctionPts.length > 0) {
    for (const ap of auctionPts) {
      const slot = slotOfFullTrend(ap.time)
      pricePoints.push({
        slot,
        price: ap.price,
        isAuction: true,
        timeStr: ap.rawTime,
        auctionPoint: ap,
      })

      const matched = ap.matchedVolume ?? ap.volume
      const unmatched = ap.unmatchedVolume ?? 0
      volumeItems.push({
        x: xOf(slot),
        slot,
        isAuction: true,
        vol: matched + unmatched,
        matchedVol: matched,
        unmatchedVol: unmatched,
        unmatchedSide: ap.unmatchedSide,
      })
    }

    // Smooth horizontal anchor across the 09:25 - 09:30 pre-trade silence period
    const lastAuction = auctionPts[auctionPts.length - 1]
    const continuousPts = trendPts
    if (lastAuction.price > 0 && continuousPts.length > 0) {
      pricePoints.push({
        slot: PRETRADE_SLOT_END, // 15
        price: lastAuction.price,
        isAuction: true,
        timeStr: '09:30:00',
      })
    }
  }

  // 2. Continuous Intraday Trend Points (09:30 - 14:57)
  const count = trendPts.length

  for (let i = 0; i < count; i++) {
    const tp = trendPts[i]
    const slot = isGlobal
      ? (i / Math.max(1, count - 1)) * 240
      : (useFullSpectrum ? slotOfFullTrend(tp.time) : slotOf(tp.time))

    const avgPrice = tp.avgPrice && isValidAvg(tp.avgPrice, preClose) ? tp.avgPrice : undefined

    pricePoints.push({
      slot,
      price: tp.price,
      avgPrice,
      isAuction: false,
      trendPoint: tp,
    })

    const vol = i === 0 ? tp.cumVolume : Math.max(0, tp.cumVolume - trendPts[i - 1].cumVolume)
    const isUp = i === 0 ? tp.price >= preClose : tp.price >= trendPts[i - 1].price
    volumeItems.push({
      x: xOf(slot),
      slot,
      isAuction: false,
      vol,
      isUp,
    })
  }

  // 2.5 Real-time live tick synchronization:
  // If opts.lastPrice is provided (and not in historical drill), synchronize the latest price point
  // so rapid market moves (like 涨停炸板 / 急速拉升 / 跳水) immediately reflect on the line and dot!
  if (opts.lastPrice && opts.lastPrice > 0 && !opts.isHistorical && !isGlobal) {
    const now = new Date()
    const bjH = (now.getUTCHours() + 8) % 24
    const bjM = now.getUTCMinutes()
    const currentHhmm = bjH * 100 + bjM
    const isLiveHours =
      (currentHhmm >= 930 && currentHhmm <= 1130) || (currentHhmm >= 1300 && currentHhmm <= 1500)
    if (isLiveHours) {
      const liveSlot = useFullSpectrum ? slotOfFullTrend(currentHhmm) : slotOf(currentHhmm)
      const lastContinuous = pricePoints.filter((p) => !p.isAuction).pop()
      if (lastContinuous) {
        if (liveSlot > lastContinuous.slot) {
          pricePoints.push({
            slot: liveSlot,
            price: opts.lastPrice,
            avgPrice: lastContinuous.avgPrice,
            isAuction: false,
          })
          volumeItems.push({
            x: xOf(liveSlot),
            slot: liveSlot,
            isAuction: false,
            vol: 0,
            isUp: opts.lastPrice >= lastContinuous.price,
          })
        } else {
          lastContinuous.price = opts.lastPrice
        }
      } else if (pricePoints.length === 0) {
        pricePoints.push({
          slot: liveSlot,
          price: opts.lastPrice,
          isAuction: false,
        })
      }
    }
  }

  // 3. Closing Call Auction Points (14:57 - 15:00)
  const closingPts = opts.auction?.closingPoints ?? []
  if (!isGlobal && closingPts.length > 0) {
    for (const cp of closingPts) {
      const slot = useFullSpectrum ? slotOfFullTrend(cp.time) : slotOf(cp.time)
      pricePoints.push({
        slot,
        price: cp.price,
        isAuction: true,
        timeStr: cp.rawTime,
        auctionPoint: cp,
      })

      const matched = cp.matchedVolume ?? cp.volume
      const unmatched = cp.unmatchedVolume ?? 0
      volumeItems.push({
        x: xOf(slot),
        slot,
        isAuction: true,
        vol: matched + unmatched,
        matchedVol: matched,
        unmatchedVol: unmatched,
        unmatchedSide: cp.unmatchedSide,
      })
    }
  }

  return { pricePoints, volumeItems }
}
