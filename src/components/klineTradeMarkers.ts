//! K-Line chart trade markers (B / S / [B][T]) with dashed leader lines.
//!
//! Follows AGENTS.md §11 (colocation, <=300 lines) and §15 (theme adaptability).

import type { KLineBar, TradeRecord } from '../types'

export interface KlineTradeGroup {
  barIndex: number
  buyCount: number
  sellCount: number
  buyShares: number
  sellShares: number
  buyAvgPrice: number
  sellAvgPrice: number
  realizedPnl: number
  trades: TradeRecord[]
}

function normalizeDateStr(d: string): string {
  if (!d) return ''
  const clean = d.split(' ')[0].replace(/[/.]/g, '-')
  if (clean.length === 8 && !clean.includes('-')) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`
  }
  return clean
}

/**
 * Match trades to the visible slice of K-line bars.
 */
export function matchTradesToBars(
  bars: KLineBar[],
  trades?: TradeRecord[]
): Map<number, KlineTradeGroup> {
  const map = new Map<number, KlineTradeGroup>()
  if (!trades || trades.length === 0 || bars.length === 0) return map

  const barDateToIndices = new Map<string, number[]>()
  for (let i = 0; i < bars.length; i++) {
    const d = normalizeDateStr(bars[i].date)
    if (!barDateToIndices.has(d)) barDateToIndices.set(d, [])
    barDateToIndices.get(d)!.push(i)
  }

  for (const t of trades) {
    if (t.status && t.status !== 'Filled') continue
    if (!t.timestamp) continue

    const tDate = normalizeDateStr(t.timestamp)
    const indices = barDateToIndices.get(tDate)
    if (!indices || indices.length === 0) continue

    let bestIdx = indices[0]
    if (indices.length > 1 && bars[bestIdx].date.includes(' ')) {
      const tTime = t.timestamp.split(' ')[1]?.slice(0, 5) ?? ''
      for (const idx of indices) {
        const bTime = bars[idx].date.split(' ')[1]?.slice(0, 5) ?? ''
        if (bTime <= tTime) bestIdx = idx
      }
    }

    if (!map.has(bestIdx)) {
      map.set(bestIdx, {
        barIndex: bestIdx, buyCount: 0, sellCount: 0,
        buyShares: 0, sellShares: 0, buyAvgPrice: 0,
        sellAvgPrice: 0, realizedPnl: 0, trades: [],
      })
    }

    const grp = map.get(bestIdx)!
    grp.trades.push(t)
    if (t.action === 'Buy') {
      const prevTotal = grp.buyAvgPrice * grp.buyShares
      grp.buyCount++
      grp.buyShares += t.shares
      grp.buyAvgPrice = (prevTotal + t.price * t.shares) / grp.buyShares
    } else {
      const prevTotal = grp.sellAvgPrice * grp.sellShares
      grp.sellCount++
      grp.sellShares += t.shares
      grp.sellAvgPrice = (prevTotal + t.price * t.shares) / grp.sellShares
      if (t.realizedPnl != null) grp.realizedPnl += t.realizedPnl
    }
  }
  return map
}

export interface PaintKlineTradeMarkersOptions {
  ctx: CanvasRenderingContext2D
  slice: KLineBar[]
  trades?: TradeRecord[]
  xOfIdx: (i: number) => number
  yOfPrice: (p: number) => number
  plotL: number
  plotW: number
  priceT: number
  priceH: number
  hoveredIndex: number | null
}

/**
 * Draw square badge with rounded corners and translucent background (Tonghuashun style).
 */
function drawSquareBadge(
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
 * Draw Buy, Sell and T markers on K-line with dashed leader line.
 */
export function paintKlineTradeMarkers(opts: PaintKlineTradeMarkersOptions): void {
  const { ctx, slice, trades, xOfIdx, yOfPrice, plotL, plotW, priceT, priceH, hoveredIndex } = opts
  if (!trades || trades.length === 0 || slice.length === 0) return

  const tradeMap = matchTradesToBars(slice, trades)
  if (tradeMap.size === 0) return

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

  for (const [idx, grp] of tradeMap.entries()) {
    const bar = slice[idx]
    if (!bar) continue

    const cx = xOfIdx(idx)
    const isHovered = hoveredIndex === idx
    const hasBuy = grp.buyCount > 0
    const hasSell = grp.sellCount > 0

    const targetPrice = hasBuy && hasSell
      ? (grp.buyAvgPrice + grp.sellAvgPrice) / 2
      : hasBuy ? grp.buyAvgPrice : grp.sellAvgPrice

    const targetY = yOfPrice(targetPrice)
    const midY = (yOfPrice(bar.high) + yOfPrice(bar.low)) / 2
    const placeAbove = targetY <= midY

    const badgeY = placeAbove
      ? Math.max(priceT + 8, yOfPrice(bar.high) - 15)
      : Math.min(priceT + priceH - 8, yOfPrice(bar.low) + 15)

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
    ctx.fillStyle = hasBuy && !hasSell ? dotColorBuy : hasSell && !hasBuy ? dotColorSell : dotColorT
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

    if (hasBuy && hasSell) {
      drawSquareBadge(ctx, cx - 6.5, badgeY, 'B', bgBuy, isHovered, isLight)
      drawSquareBadge(ctx, cx + 6.5, badgeY, 'T', bgT, isHovered, isLight)
    } else if (hasBuy) {
      drawSquareBadge(ctx, cx, badgeY, 'B', bgBuy, isHovered, isLight)
    } else {
      drawSquareBadge(ctx, cx, badgeY, 'S', bgSell, isHovered, isLight)
    }

    // 3. Hover tooltip
    if (isHovered) {
      drawKlineTradeTooltip(ctx, grp, cx, targetY, plotL, plotW, priceT, isLight)
    }
  }
}

/**
 * Draw tooltip bubble for hovered K-line trade.
 */
function drawKlineTradeTooltip(
  ctx: CanvasRenderingContext2D,
  grp: KlineTradeGroup,
  cx: number,
  cy: number,
  plotL: number,
  plotW: number,
  priceT: number,
  isLight: boolean
): void {
  ctx.save()
  ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const lines: string[] = []
  if (grp.buyCount > 0) {
    const multiStr = grp.buyCount > 1 ? ` (${grp.buyCount}笔)` : ''
    lines.push(`买入: ${grp.buyShares}股 @ ¥${grp.buyAvgPrice.toFixed(2)}${multiStr}`)
  }
  if (grp.sellCount > 0) {
    const pnlSign = grp.realizedPnl >= 0 ? '+' : ''
    const pnlStr = grp.realizedPnl !== 0 ? ` (${pnlSign}¥${grp.realizedPnl.toFixed(1)})` : ''
    const multiStr = grp.sellCount > 1 ? ` (${grp.sellCount}笔)` : ''
    lines.push(`卖出: ${grp.sellShares}股 @ ¥${grp.sellAvgPrice.toFixed(2)}${pnlStr}${multiStr}`)
  }

  const padX = 7, padY = 5, lineH = 12
  let maxW = 0
  for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width)
  const tipW = maxW + padX * 2
  const tipH = lines.length * lineH + padY * 2

  let tipX = Math.max(plotL + 2, Math.min(plotL + plotW - tipW - 2, cx - tipW / 2))
  let tipY = cy - tipH - 12
  if (tipY < priceT) tipY = cy + 12

  ctx.shadowColor = isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.55)'
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
