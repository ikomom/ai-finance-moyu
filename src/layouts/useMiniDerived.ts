//! Derived values for the Mini layout card (cost basis, hover read-outs, stats).
//!
//! Extracted from `MiniBody.tsx` so both files stay inside the 300-line budget
//! (AGENTS.md §11). Pure derivation only — no rendering, no side effects.

import type { Accessor } from 'solid-js'
import {
  fmtAmount,
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
import { getClearedPnl } from '../components/portfolio/tradeHelpers'

export type MiniMode = 'trend' | 'five_day' | 'kline' | 'auction'

export interface MiniDerivedArgs {
  quote: Accessor<Quote>
  item: Accessor<WatchItem | undefined>
  snapshot: Accessor<Snapshot>
  activeMode: Accessor<MiniMode>
  subchartMode: Accessor<'vol' | 'macd'>
  historyDrillDay?: Accessor<import('../types').DayTrend | null>
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
  const historyDrillDay = args.historyDrillDay
  const hoveredPoint = args.hoveredPoint
  const hoveredPointExtra = args.hoveredPointExtra
  const hoveredAuctionPoint = args.hoveredAuctionPoint
  const hoveredKBar = args.hoveredKBar
  const hoveredKExtra = args.hoveredKExtra

  const portfolioPos = () => {
    if (!s().config.enablePortfolio) return null
    return (
      (s().positions ?? []).find(
        (p) => p.code.toLowerCase() === q().code.toLowerCase() && p.shares > 0
      ) ?? null
    )
  }

  const cost = () => {
    if (s().config.enablePortfolio) {
      const pos = portfolioPos()
      return pos && pos.shares > 0 ? pos.costPrice : null
    }
    return item()?.costPrice ?? null
  }

  const shares = () => {
    if (s().config.enablePortfolio) {
      const pos = portfolioPos()
      return pos && pos.shares > 0 ? pos.shares : null
    }
    return item()?.shares ?? null
  }
  const pnl = () => profitAmount(q().price, cost(), shares())
  const clearedPnl = () => {
    if (!s().config.enablePortfolio) return null
    const pos = portfolioPos()
    if (pos && pos.shares > 0) return null
    return getClearedPnl(q().code, s().trades)
  }
  const trend = () => {
    const t = s().trends[q().code]
    if (!t) return undefined
    const qDate = q().date
    if (qDate && t.date && t.date < qDate) {
      return { ...t, points: [] }
    }
    return t
  }
  const auction = () => s().auctions?.[q().code]

  // High / Low stats from trend points or K-line bar
  const stats = () => {
    const drill = historyDrillDay?.()
    if (drill) {
      const pts = drill.points ?? []
      if (pts.length > 0) {
        let high = pts[0].price, low = pts[0].price
        for (const p of pts) {
          if (p.price > high) high = p.price
          if (p.price > 0 && p.price < low) low = p.price
        }
        return { high, low }
      }
    }
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      if (hk) return { high: hk.high, low: hk.low }
    }
    const pts = trend()?.points ?? []
    if (pts.length === 0) {
      const aucPts = auction()?.points ?? []
      if (aucPts.length > 0) {
        let high = 0, low = 0
        for (const p of aucPts) {
          if (p.price > 0) {
            if (high === 0 || p.price > high) high = p.price
            if (low === 0 || p.price < low) low = p.price
          }
        }
        if (high > 0 && low > 0) return { high, low }
      }
      return { high: q().high || q().price, low: q().low || q().price }
    }
    let high = pts[0].price, low = pts[0].price
    for (const p of pts) {
      if (p.price > high) high = p.price
      if (p.price > 0 && p.price < low) low = p.price
    }
    return { high, low }
  }

  // Dynamic price & real-time percent when hovering over historical points
  const activePrice = () => {
    const drill = historyDrillDay?.()
    if (drill) {
      const hp = hoveredPoint()
      if (hp && hp.price > 0) return hp.price
      const pts = drill.points ?? []
      const last = pts[pts.length - 1]
      if (last && last.price > 0) return last.price
    }
    if (activeMode() === 'kline') {
      return hoveredKBar()?.close ?? q().price
    }
    const ap = hoveredPointExtra()?.auctionPoint ?? hoveredAuctionPoint?.()
    if (ap) return ap.price ?? q().price
    return hoveredPoint()?.price ?? q().price
  }

  const activePct = () => {
    const drill = historyDrillDay?.()
    if (drill) {
      const pc = drill.preClose > 0 ? drill.preClose : q().preClose
      const hp = hoveredPoint()
      if (hp && hp.price > 0 && pc > 0) return ((hp.price - pc) / pc) * 100
      const pts = drill.points ?? []
      const last = pts[pts.length - 1]
      if (last && last.price > 0 && pc > 0) return ((last.price - pc) / pc) * 100
    }
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      return hk ? (hoveredKExtra()?.chgPct ?? 0) : q().changePct
    }
    const ap = hoveredPointExtra()?.auctionPoint ?? hoveredAuctionPoint?.()
    if (ap && q().preClose > 0) {
      return ((ap.price - q().preClose) / q().preClose) * 100
    }
    const hp = hoveredPoint()
    if (hp) {
      const hpe = hoveredPointExtra()
      const base = (hpe?.preClose && hpe.preClose > 0)
        ? hpe.preClose
        : (q().preClose > 0 ? q().preClose : (q().open > 0 ? q().open : hp.price))
      return base > 0 ? ((hp.price - base) / base) * 100 : 0
    }
    return q().changePct
  }

  const hoverTime = () => {
    const drill = historyDrillDay?.()
    if (drill) {
      const hp = hoveredPoint()
      if (!hp) return null
      const timeStr = fmtHHMM(hp.time)
      const d = drill.date.length === 8 ? `${drill.date.slice(4, 6)}-${drill.date.slice(6, 8)}` : drill.date.slice(-5)
      return `${d} ${timeStr}`
    }
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      if (!hk?.date) return null
      // For minute K-lines (e.g. "2026-10-26 14:30:00"), condense to "10-26 14:30"
      if (hk.date.length >= 16 && hk.date.includes(' ')) {
        const parts = hk.date.split(' ')
        const d = parts[0].length >= 10 ? parts[0].slice(5) : parts[0]
        const t = parts[1].slice(0, 5)
        return `${d} ${t}`
      }
      return hk.date
    }
    const ap = hoveredPointExtra()?.auctionPoint ?? hoveredAuctionPoint?.()
    if (ap) return ap.rawTime || fmtHHMM(ap.time)
    const hp = hoveredPoint()
    if (!hp) return null
    const timeStr = fmtHHMM(hp.time)
    const hpe = hoveredPointExtra()
    if (hpe?.date) {
      const d = hpe.date.length === 8 ? `${hpe.date.slice(4, 6)}-${hpe.date.slice(6, 8)}` : hpe.date.slice(-5)
      return `${d} ${timeStr}`
    }
    return timeStr
  }

  const hoverExtra = () => {
    const drill = historyDrillDay?.()
    if (drill) {
      const hpe = hoveredPointExtra()
      if (hpe) {
        if (subchartMode() === 'macd' && hpe.dif != null && hpe.macd != null) {
          return `DIF ${hpe.dif.toFixed(2)} · MACD ${hpe.macd.toFixed(2)}`
        }
        let text = ''
        if (hpe.minVol > 0) {
          text = `量 ${fmtVol(hpe.minVol)}手`
          if (hpe.amount && hpe.amount > 0) text += ` · 额 ${fmtAmount(hpe.amount)}`
        }
        if (hpe.tradeGroup) {
          const verb = hpe.tradeGroup.type === 'B' ? '买' : hpe.tradeGroup.type === 'S' ? '卖' : '做T'
          text += ` · ${verb} ${hpe.tradeGroup.trades.length}笔 (${hpe.tradeGroup.totalShares}股)`
        }
        if (text) return text
      }
      return null
    }
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
      let text = ''
      if (hpe.minVol > 0) {
        text = `量 ${fmtVol(hpe.minVol)}手`
        if (hpe.amount && hpe.amount > 0) {
          text += ` · 额 ${fmtAmount(hpe.amount)}`
        }
      }
      if (hpe.tradeGroup) {
        const tg = hpe.tradeGroup
        const verb = tg.type === 'B' ? '买' : tg.type === 'S' ? '卖' : '做T'
        text += ` · ${verb} ${tg.trades.length}笔 (${tg.totalShares}股)`
      }
      if (text) return text
    }
    return null
  }

  return { cost, shares, pnl, clearedPnl, trend, auction, stats, activePrice, activePct, hoverTime, hoverExtra }
}
