//! Derived values for the Mini layout card (cost basis, hover read-outs, stats).
//!
//! Extracted from `MiniBody.tsx` so both files stay inside the 300-line budget
//! (AGENTS.md §11). Pure derivation only — no rendering, no side effects.

import type { Accessor } from 'solid-js'
import {
  fmtHHMM,
  fmtVol,
  profitAmount,
  type AuctionPoint,
  type KLineBar,
  type Quote,
  type Snapshot,
  type TrendPoint,
  type WatchItem,
} from '../types'
import type { HoverExtra } from '../components/Chart'

export type MiniMode = 'trend' | 'kline' | 'auction'

export interface MiniDerivedArgs {
  quote: Accessor<Quote>
  item: Accessor<WatchItem | undefined>
  snapshot: Accessor<Snapshot>
  activeMode: Accessor<MiniMode>
  subchartMode: Accessor<'vol' | 'macd'>
  hoveredPoint: Accessor<TrendPoint | null>
  hoveredPointExtra: Accessor<HoverExtra | null>
  hoveredAuctionPoint?: Accessor<AuctionPoint | null>
  hoveredKBar: Accessor<KLineBar | null>
  hoveredKExtra: Accessor<{
    ma5?: number | null
    ma10?: number | null
    ma20?: number | null
    dif?: number | null
    dea?: number | null
    macd?: number | null
    chgPct?: number | null
  } | null>
}

export function createMiniDerived(args: MiniDerivedArgs) {
  const item = args.item
  const q = args.quote
  const s = args.snapshot
  const activeMode = args.activeMode
  const subchartMode = args.subchartMode
  const hoveredPoint = args.hoveredPoint
  const hoveredPointExtra = args.hoveredPointExtra
  const hoveredAuctionPoint = args.hoveredAuctionPoint
  const hoveredKBar = args.hoveredKBar
  const hoveredKExtra = args.hoveredKExtra

  const cost = () => item()?.costPrice ?? null
  const shares = () => item()?.shares ?? null
  const pnl = () => profitAmount(q().price, cost(), shares())
  const trend = () => s().trends[q().code]
  const auction = () => s().auctions?.[q().code]

  // High / Low stats from trend points or K-line bar
  const stats = () => {
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      if (hk) return { high: hk.high, low: hk.low }
    }
    const pts = trend()?.points ?? []
    if (pts.length === 0) return { high: q().high || q().price, low: q().low || q().price }
    let high = pts[0].price
    let low = pts[0].price
    for (const p of pts) {
      if (p.price > high) high = p.price
      if (p.price > 0 && p.price < low) low = p.price
    }
    return { high, low }
  }

  // Dynamic price & real-time percent when hovering over historical points
  const activePrice = () => {
    if (activeMode() === 'kline') {
      return hoveredKBar()?.close ?? q().price
    }
    const ap = hoveredPointExtra()?.auctionPoint ?? hoveredAuctionPoint?.()
    if (ap) {
      return ap.price ?? q().price
    }
    return hoveredPoint()?.price ?? q().price
  }

  const activePct = () => {
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      if (hk) {
        return hoveredKExtra()?.chgPct ?? 0
      }
      return q().changePct
    }
    const ap = hoveredPointExtra()?.auctionPoint ?? hoveredAuctionPoint?.()
    if (ap && q().preClose > 0) {
      return ((ap.price - q().preClose) / q().preClose) * 100
    }
    const hp = hoveredPoint()
    if (hp) {
      const base = q().preClose > 0 ? q().preClose : (q().open > 0 ? q().open : hp.price)
      return base > 0 ? ((hp.price - base) / base) * 100 : 0
    }
    return q().changePct
  }

  const hoverTime = () => {
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      return hk ? hk.date : null
    }
    const ap = hoveredPointExtra()?.auctionPoint ?? hoveredAuctionPoint?.()
    if (ap) {
      return ap.rawTime || fmtHHMM(ap.time)
    }
    const hp = hoveredPoint()
    return hp ? fmtHHMM(hp.time) : null
  }

  const hoverExtra = () => {
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      const ex = hoveredKExtra()
      if (!hk) return null
      if (subchartMode() === 'macd' && ex && ex.dif != null && ex.macd != null) {
        return `DIF ${ex.dif.toFixed(2)} · MACD ${ex.macd.toFixed(2)}`
      }
      return `量 ${fmtVol(hk.volume)}手`
    }

    const ap = hoveredPointExtra()?.auctionPoint ?? hoveredAuctionPoint?.()
    if (ap) {
      const m = ap.matchedVolume ?? ap.volume
      const u = ap.unmatchedVolume ?? 0
      const side = ap.unmatchedSide ?? 'none'
      if (u > 0 && side !== 'none') {
        const sideText = side === 'buy' ? '买多' : '卖多'
        return `撮合 ${fmtVol(m)}手 · ${sideText} ${fmtVol(u)}手`
      }
      if (m > 0) {
        return `撮合 ${fmtVol(m)}手 (完全撮合)`
      }
      return `量 ${fmtVol(ap.volume)}手`
    }

    const hpe = hoveredPointExtra()
    if (hpe) {
      if (subchartMode() === 'macd' && hpe.dif != null && hpe.macd != null) {
        return `DIF ${hpe.dif.toFixed(2)} · MACD ${hpe.macd.toFixed(2)}`
      }
      if (hpe.minVol > 0) {
        return `量 ${fmtVol(hpe.minVol)}手`
      }
    }
    return null
  }

  return { cost, shares, pnl, trend, auction, stats, activePrice, activePct, hoverTime, hoverExtra }
}
