//! K-line canvas painting.
//!
//! Moved verbatim out of `KlineCanvas.tsx`, which keeps element refs, viewport
//! state and pointer handling (AGENTS.md §11). Everything the painter needs is
//! passed in explicitly — it reads no component state.

import {
  COST_LINE,
  FONT,
  getChartTheme,
  setupCanvasDpi,
} from '../chart'
import { paintBarsAndOverlay } from './klineBarsOverlay'
import { paintSubchart } from './klineSubchart'
import type { KlinePaint } from './klinePaintTypes'
import { fmtPrice, fmtVol, type KLineBar, type PriceLine, type Quote } from '../types'

export interface KlineDrawProps {
  compact?: boolean
  subchartMode?: 'vol' | 'macd'
  macdParams?: [number, number, number]
  maPeriods?: [number, number, number]
  costPrice?: number | null
  priceLines?: PriceLine[]
}

export interface KlineHoverExtra {
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
  dif?: number | null
  dea?: number | null
  macd?: number | null
  chgPct?: number | null
}

export interface KlineDrawContext {
  canvas: HTMLCanvasElement
  props: KlineDrawProps
  bars: KLineBar[]
  quote?: Quote
  hoveredIndex: number | null
  visibleCount: number
  offsetRight: number
}

export function drawKline(ctxIn: KlineDrawContext): void {
  const props = ctxIn.props
  const hoveredIndex = () => ctxIn.hoveredIndex
  const effectiveBars = () => ctxIn.bars
  const visibleCount = () => ctxIn.visibleCount
  const offsetRight = () => ctxIn.offsetRight

    const canvas = ctxIn.canvas
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (w < 10 || h < 10) return

    const dpi = setupCanvasDpi(canvas, w, h)
    if (!dpi) return
    const { ctx } = dpi

    const allBars = effectiveBars()
    if (allBars.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'
      ctx.font = FONT
      ctx.textAlign = 'center'
      ctx.fillText('日K线加载中...', w / 2, h / 2)
      return
    }

    // Geometry layout
    const padL = props.compact ? 4 : 6
    const padR = props.compact ? 36 : 42
    const legendH = 14
    const bottomAxisH = 13
    const plotL = padL
    const plotW = Math.max(10, w - padL - padR)

    const contentH = Math.max(20, h - legendH - bottomAxisH)
    const priceH = Math.max(20, Math.round(contentH * 0.58))
    const volH = Math.max(12, contentH - priceH - 3)

    const priceT = legendH
    const volT = priceT + priceH + 3
    const subPlotPad = 10
    const subPlotH = Math.max(6, volH - subPlotPad)

    // Window slice
    const total = allBars.length
    const count = Math.min(total, Math.max(15, visibleCount()))
    const maxOffset = Math.max(0, total - count)
    const off = Math.min(maxOffset, Math.max(0, offsetRight()))

    const startIdx = Math.max(0, total - off - count)
    const endIdx = Math.min(total, startIdx + count)
    const slice = allBars.slice(startIdx, endIdx)

    if (slice.length === 0) {
      return
    }

    // Price scaling
    let minP = Infinity
    let maxP = -Infinity
    let maxV = 0

    for (const b of slice) {
      if (b.low < minP) minP = b.low
      if (b.high > maxP) maxP = b.high
      if (b.ma5 != null) {
        if (b.ma5 < minP) minP = b.ma5
        if (b.ma5 > maxP) maxP = b.ma5
      }
      if (b.ma10 != null) {
        if (b.ma10 < minP) minP = b.ma10
        if (b.ma10 > maxP) maxP = b.ma10
      }
      if (b.ma20 != null) {
        if (b.ma20 < minP) minP = b.ma20
        if (b.ma20 > maxP) maxP = b.ma20
      }
      if (b.volume > maxV) maxV = b.volume
    }

    // Include cost line if configured and reasonably close
    if (props.costPrice && props.costPrice > 0) {
      const cp = props.costPrice
      if (cp >= minP * 0.7 && cp <= maxP * 1.3) {
        if (cp < minP) minP = cp
        if (cp > maxP) maxP = cp
      }
    }

    if (!Number.isFinite(minP) || !Number.isFinite(maxP) || minP >= maxP) {
      minP = minP === Infinity ? 10 : minP * 0.95
      maxP = maxP === -Infinity ? 10.5 : maxP * 1.05
    }

    // Margin padding 4% top and bottom
    const pMargin = (maxP - minP) * 0.04
    minP -= pMargin
    maxP += pMargin
    const pRange = maxP - minP

    const yOfPrice = (p: number) => priceT + priceH - ((p - minP) / pRange) * priceH
    const yOfVol = (v: number) => (maxV > 0 ? volT + volH - (v / maxV) * subPlotH : volT + volH)

    const slotW = plotW / slice.length
    const xOfIdx = (i: number) => plotL + i * slotW + slotW / 2

    const chartTheme = getChartTheme()

    // 1. Grid & Price Axis
    ctx.strokeStyle = chartTheme.grid
    ctx.lineWidth = 1
    ctx.beginPath()

    // 3 horizontal price grid lines
    const gridRows = 3
    for (let r = 0; r <= gridRows; r++) {
      const y = Math.round(priceT + (priceH / gridRows) * r) + 0.5
      ctx.moveTo(plotL, y)
      ctx.lineTo(plotL + plotW, y)
    }
    // Volume top divider
    ctx.moveTo(plotL, Math.round(volT) - 0.5)
    ctx.lineTo(plotL + plotW, Math.round(volT) - 0.5)
    ctx.stroke()

    // Price labels on the right
    ctx.font = FONT
    ctx.fillStyle = chartTheme.axisText
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(fmtPrice(maxP), plotL + plotW + 4, priceT + 5)
    ctx.fillText(fmtPrice((maxP + minP) / 2), plotL + plotW + 4, priceT + priceH / 2)
    ctx.fillText(fmtPrice(minP), plotL + plotW + 4, priceT + priceH - 4)

    // Volume label on the right
    if (maxV > 0) {
      ctx.fillText(fmtVol(maxV), plotL + plotW + 4, volT + 5)
    }

    // 2. Cost Price Line & Price Lines
    if (props.costPrice && props.costPrice > 0) {
      const cp = props.costPrice
      if (cp >= minP && cp <= maxP) {
        const cy = Math.round(yOfPrice(cp)) + 0.5
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = COST_LINE
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(plotL, cy)
        ctx.lineTo(plotL + plotW, cy)
        ctx.stroke()

        ctx.fillStyle = COST_LINE
        const latestPrice = allBars.length > 0 ? allBars[allBars.length - 1].close : null
        const pct = latestPrice && cp > 0 ? ((latestPrice - cp) / cp) * 100 : null
        const label = pct !== null ? `成本 ${fmtPrice(cp)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : `成本 ${fmtPrice(cp)}`
        ctx.fillText(label, plotL + plotW + 4, cy)
        ctx.restore()
      }
    }

    if (props.priceLines) {
      for (const pl of props.priceLines) {
        if (pl.price >= minP && pl.price <= maxP) {
          const py = Math.round(yOfPrice(pl.price)) + 0.5
          ctx.save()
          ctx.setLineDash([2, 2])
          ctx.strokeStyle = pl.direction === 'above' ? 'rgba(239, 68, 68, 0.65)' : 'rgba(34, 197, 94, 0.65)'
          ctx.beginPath()
          ctx.moveTo(plotL, py)
          ctx.lineTo(plotL + plotW, py)
          ctx.stroke()
          ctx.restore()
        }
      }
    }


    const barW = Math.max(1.5, Math.min(18, slotW * 0.72))
    const paint: KlinePaint = {
      ctx,
      props,
      slice,
      allBars,
      startIdx,
      slotW,
      barW,
      plotL,
      plotW,
      priceT,
      priceH,
      volT,
      volH,
      subPlotH,
      chartTheme,
      xOfIdx,
      yOfPrice,
      yOfVol,
      hoveredIndex,
    }

    paintSubchart(paint)
    paintBarsAndOverlay(paint)
}
