//! Intraday trend trade markers (B / S / [B][T]) with dashed leader lines.
//!
//! Follows AGENTS.md §11 (colocation, <=300 lines) and §15 (theme adaptability).

import type { TradeRecord } from '../../types/portfolio'
import { slotOf, slotOfFullTrend } from '../scale'

export interface TradeMarkerGroup {
  slot: number
  avgPrice: number
  totalShares: number
  buyCount: number
  sellCount: number
  buyShares: number
  sellShares: number
  realizedPnl: number
  trades: TradeRecord[]
  type: 'B' | 'S' | 'T'
}

function parseTradeTimeNum(timestamp: string): number | null {
  if (!timestamp) return null
  const m = timestamp.match(/(\d{1,2}):(\d{2})/)
  return m ? parseInt(m[1], 10) * 100 + parseInt(m[2], 10) : null
}

/**
 * Group intraday filled trades by trend chart slot.
 */
export function groupIntradayTrades(
  trades: TradeRecord[] | undefined,
  targetDate: string | undefined,
  useFullSpectrum: boolean,
  isGlobal = false
): TradeMarkerGroup[] {
  if (!trades || trades.length === 0) return []
  const effDate = targetDate
    ? targetDate.includes('-') ? targetDate : `${targetDate.slice(0, 4)}-${targetDate.slice(4, 6)}-${targetDate.slice(6, 8)}`
    : new Date().toISOString().slice(0, 10)

  const matched = trades.filter((t) => {
    if (t.status && t.status !== 'Filled') return false
    if (!t.timestamp) return false
    return t.timestamp.slice(0, 10) === effDate
  })
  if (matched.length === 0) return []

  const slotMap = new Map<number, TradeRecord[]>()
  for (const t of matched) {
    const timeNum = parseTradeTimeNum(t.timestamp)
    if (timeNum == null) continue
    const slot = isGlobal
      ? Math.round(((timeNum - 930) / 570) * 240)
      : (useFullSpectrum ? slotOfFullTrend(timeNum) : slotOf(timeNum))
    if (!slotMap.has(slot)) slotMap.set(slot, [])
    slotMap.get(slot)!.push(t)
  }

  const groups: TradeMarkerGroup[] = []
  for (const [slot, list] of slotMap.entries()) {
    let buyCount = 0, sellCount = 0, buyShares = 0, sellShares = 0
    let totalCost = 0, totalShares = 0, realizedPnl = 0

    for (const t of list) {
      totalCost += t.price * t.shares
      totalShares += t.shares
      if (t.action === 'Buy') {
        buyCount++
        buyShares += t.shares
      } else {
        sellCount++
        sellShares += t.shares
        if (t.realizedPnl != null) realizedPnl += t.realizedPnl
      }
    }
    const avgPrice = totalShares > 0 ? totalCost / totalShares : list[0].price
    const type: 'B' | 'S' | 'T' = buyCount > 0 && sellCount > 0 ? 'T' : buyCount > 0 ? 'B' : 'S'
    groups.push({
      slot, avgPrice, totalShares, buyCount, sellCount,
      buyShares, sellShares, realizedPnl, trades: list, type,
    })
  }
  return groups
}

export interface TradePointsRenderOptions {
  ctx: CanvasRenderingContext2D
  trades?: TradeRecord[]
  tradeDate?: string
  xOf: (slot: number) => number
  yOf: (price: number) => number
  plotL: number
  plotW: number
  plotT: number
  priceH: number
  useFullSpectrum: boolean
  isGlobal?: boolean
  hoverSlot?: number | null
}

/**
 * Draw square badge with rounded corners and translucent background (Tonghuashun style).
 */
function drawTrendSquareBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  label: string,
  bgColor: string,
  isHovered: boolean,
  isLight: boolean
): void {
  const size = isHovered ? 13 : 11.5
  const half = size / 2

  ctx.save()
  ctx.shadowColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = isHovered ? 4 : 2
  ctx.shadowOffsetY = 1

  // Translucent background
  ctx.fillStyle = bgColor
  ctx.beginPath()
  ctx.roundRect(cx - half, cy - half, size, size, 2)
  ctx.fill()

  // Delicate border
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = isHovered ? '#ffffff' : (isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.65)')
  ctx.lineWidth = isHovered ? 1.5 : 1
  ctx.stroke()

  // Crisp white label
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 8.5px ui-monospace, "SF Mono", Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, cx, cy + 0.5)
  ctx.restore()
}

/**
 * Draw trade markers and optional hover tooltip.
 */
export function drawTradePoints(opts: TradePointsRenderOptions): TradeMarkerGroup | null {
  const { ctx, trades, tradeDate, xOf, yOf, plotL, plotW, plotT, priceH, useFullSpectrum, isGlobal, hoverSlot } = opts
  const groups = groupIntradayTrades(trades, tradeDate, useFullSpectrum, isGlobal ?? false)
  if (groups.length === 0) return null

  const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  const dashLineColor = isLight ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.5)'

  // Anchor dot colors (crisp) & badge backgrounds with slight translucency (0.82 regular, 0.96 hovered)
  const dotColorBuy = isLight ? '#dc2626' : '#ef4444'
  const dotColorSell = isLight ? '#16a34a' : '#10b981'
  const dotColorT = isLight ? '#d97706' : '#f59e0b'

  const getBadgeBg = (type: 'B' | 'S' | 'T', hovered: boolean) => {
    const alpha = hovered ? 0.96 : 0.82
    if (type === 'B') return isLight ? `rgba(220, 38, 38, ${alpha})` : `rgba(239, 68, 68, ${alpha})`
    if (type === 'S') return isLight ? `rgba(22, 163, 74, ${alpha})` : `rgba(16, 185, 129, ${alpha})`
    return isLight ? `rgba(217, 119, 6, ${alpha})` : `rgba(245, 158, 11, ${alpha})`
  }

  let activeGroup: TradeMarkerGroup | null = null
  if (hoverSlot != null) {
    let minDiff = 2
    for (const g of groups) {
      const diff = Math.abs(g.slot - hoverSlot)
      if (diff <= minDiff) {
        minDiff = diff
        activeGroup = g
      }
    }
  }

  for (const g of groups) {
    const rawX = xOf(g.slot)
    const targetY = yOf(g.avgPrice)
    const cx = Math.max(plotL + 9, Math.min(plotL + plotW - 9, rawX))
    const isHovered = activeGroup === g

    const midY = plotT + priceH / 2
    const placeAbove = targetY <= midY
    const badgeY = placeAbove
      ? Math.max(plotT + 8, targetY - 15)
      : Math.min(plotT + priceH - 8, targetY + 15)

    // 1. Leader dashed line
    ctx.save()
    ctx.setLineDash([2, 2])
    ctx.strokeStyle = dashLineColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, targetY)
    ctx.lineTo(cx, badgeY)
    ctx.stroke()

    // Price anchor dot
    ctx.setLineDash([])
    ctx.fillStyle = g.type === 'B' ? dotColorBuy : g.type === 'S' ? dotColorSell : dotColorT
    ctx.beginPath()
    ctx.arc(cx, targetY, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.8
    ctx.stroke()
    ctx.restore()

    // 2. Square badges with translucent background
    const bgBuy = getBadgeBg('B', isHovered)
    const bgSell = getBadgeBg('S', isHovered)
    const bgT = getBadgeBg('T', isHovered)

    if (g.type === 'T') {
      drawTrendSquareBadge(ctx, cx - 6.5, badgeY, 'B', bgBuy, isHovered, isLight)
      drawTrendSquareBadge(ctx, cx + 6.5, badgeY, 'T', bgT, isHovered, isLight)
    } else if (g.type === 'B') {
      drawTrendSquareBadge(ctx, cx, badgeY, 'B', bgBuy, isHovered, isLight)
    } else {
      drawTrendSquareBadge(ctx, cx, badgeY, 'S', bgSell, isHovered, isLight)
    }
  }

  // Draw tooltip for hovered activeGroup
  if (activeGroup) {
    const g = activeGroup
    const cx = Math.max(plotL + 10, Math.min(plotL + plotW - 10, xOf(g.slot)))
    const cy = Math.max(plotT + 8, Math.min(plotT + priceH - 8, yOf(g.avgPrice)))

    ctx.save()
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'

    const lines: string[] = []
    if (g.type === 'B') {
      const multiStr = g.buyCount > 1 ? ` (${g.buyCount}笔)` : ''
      lines.push(`买入 ${g.buyShares}股 @ ¥${g.avgPrice.toFixed(2)}${multiStr}`)
    } else if (g.type === 'S') {
      const pnlSign = g.realizedPnl >= 0 ? '+' : ''
      const pnlStr = g.realizedPnl !== 0 ? ` (${pnlSign}¥${g.realizedPnl.toFixed(1)})` : ''
      const multiStr = g.sellCount > 1 ? ` (${g.sellCount}笔)` : ''
      lines.push(`卖出 ${g.sellShares}股 @ ¥${g.avgPrice.toFixed(2)}${pnlStr}${multiStr}`)
    } else {
      lines.push(`做T买 ${g.buyShares}股 / 卖 ${g.sellShares}股`)
      lines.push(`均价 ¥${g.avgPrice.toFixed(2)}`)
    }

    const padX = 7, padY = 5, lineH = 12
    let maxW = 0
    for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width)
    const tipW = maxW + padX * 2
    const tipH = lines.length * lineH + padY * 2

    let tipX = Math.max(plotL + 2, Math.min(plotL + plotW - tipW - 2, cx - tipW / 2))
    let tipY = cy - tipH - 12
    if (tipY < plotT) tipY = cy + 12

    ctx.shadowColor = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 6
    ctx.shadowOffsetY = 2

    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.94)'
    ctx.beginPath()
    ctx.roundRect(tipX, tipY, tipW, tipH, 4)
    ctx.fill()

    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.2)'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = isLight ? '#0f172a' : '#f8fafc'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], tipX + padX, tipY + padY + i * lineH)
    }
    ctx.restore()
  }

  return activeGroup
}
