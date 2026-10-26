import { computeMinuteMacd } from '../../utils/indicators'
import { drawCrosshair, drawHorizontalLevel, setupCanvasDpi } from '../canvasUtils'
import { FONT, getChartTheme } from '../theme'
import type { DrawOptions } from '../types'
import { FULL_SLOTS, SLOTS, slotOf, slotOfFullTrend } from '../scale'
import { drawGrid, drawPriceAxis, drawTimeAxis, type PlotGeometry } from './trendAxes'
import { buildUnifiedChartData, computeUnifiedMaxDev, isFullSpectrumActive } from './trendData'
import { drawMacdSubchart } from './macdRenderer'
import { drawMinuteVolumeSubchart } from './volumeRenderer'
import { drawTrendPrice } from './trendRenderer'

export function drawTrend(canvas: HTMLCanvasElement, opts: DrawOptions): void {
  const dpi = setupCanvasDpi(canvas)
  if (!dpi) return
  const { ctx, cssW, cssH } = dpi
  const theme = getChartTheme()

  ctx.font = FONT
  ctx.textBaseline = 'middle'

  const compact = opts.compact ?? false
  const pad = compact
    ? { left: 38, right: 34, top: 6, bottom: 12 }
    : { left: 44, right: 40, top: 8, bottom: 14 }

  const plotL = pad.left
  const plotT = pad.top
  const plotW = Math.max(1, cssW - pad.left - pad.right)
  const plotH = Math.max(1, cssH - pad.top - pad.bottom)

  // Split plotH into price section (58%) and subchart (42%)
  const priceH = Math.max(20, Math.round(plotH * 0.58))
  const volGap = 3
  const volT = plotT + priceH + volGap
  const volH = Math.max(12, plotH - priceH - volGap)
  const subTextPad = 10
  const subPlotH = Math.max(6, volH - subTextPad)

  const points = opts.trend?.points ?? []
  const preClose = opts.preClose || opts.trend?.preClose || 0
  const isGlobal = opts.isGlobal ?? false
  const useFullSpectrum = isFullSpectrumActive(opts)
  const totalSlots = isGlobal ? SLOTS : (useFullSpectrum ? FULL_SLOTS : SLOTS)

  const xOf = (slot: number) => plotL + (slot / totalSlots) * plotW

  // --- y range: symmetric about 昨收 -------------------------------------
  const maxDev = computeUnifiedMaxDev(points, preClose, opts)
  const yMin = preClose - maxDev
  const yTop = preClose + maxDev
  const span = yTop - yMin || 1

  const yOf = (price: number) => plotT + (1 - (price - yMin) / span) * priceH
  const geo: PlotGeometry = { plotL, plotT, plotW, priceH, volT, volH }

  // --- grid ---------------------------------------------------------------
  drawGrid(ctx, theme, geo, isGlobal, useFullSpectrum)

  // --- 昨收 baseline (the centre line) ------------------------------------
  const yPre = yOf(preClose)
  ctx.save()
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = theme.preCloseLine
  ctx.beginPath()
  ctx.moveTo(plotL, yPre)
  ctx.lineTo(plotL + plotW, yPre)
  ctx.stroke()
  ctx.restore()

  // --- axis labels --------------------------------------------------------
  drawPriceAxis(ctx, theme, geo, preClose, maxDev, yOf)
  drawTimeAxis(ctx, geo, isGlobal, points, useFullSpectrum)

  // Assemble unified auction + continuous points
  const { pricePoints, volumeItems } = buildUnifiedChartData(opts, xOf, useFullSpectrum)

  canvas.dataset.geom =
    `css=${Math.round(cssW)}x${Math.round(cssH)} pad=${pad.left}/${pad.right}` +
    ` plot=${plotL}+${Math.round(plotW)}x${Math.round(plotH)}`
  canvas.dataset.points = String(pricePoints.length)

  if (pricePoints.length === 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = theme.axisText
    ctx.fillText('暂无分时数据', plotL + plotW / 2, plotT + priceH / 2)
    return
  }

  // Draw price curves (auction and continuous) & average price line
  drawTrendPrice({
    ctx,
    points: pricePoints,
    preClose,
    lastPrice: opts.lastPrice,
    xOf,
    yOf,
    yPre,
  })

  // --- subchart: switchable VOL vs MACD ------------------------------------
  const subMode = opts.subchartMode ?? 'vol'

  let activeVolIdx: number | null = null
  if (opts.hoverSlot != null && volumeItems.length > 0) {
    let minDiff = 999
    for (let i = 0; i < volumeItems.length; i++) {
      const diff = Math.abs(volumeItems[i].slot - opts.hoverSlot)
      if (diff < minDiff) {
        minDiff = diff
        activeVolIdx = i
      }
    }
  }

  if (subMode === 'vol') {
    const barW = Math.max(1, (plotW / totalSlots) * 0.82)
    drawMinuteVolumeSubchart({
      ctx,
      plotL,
      plotW,
      volT,
      volH,
      subPlotH,
      items: volumeItems,
      barWidth: barW,
      activeIdx: activeVolIdx,
    })
  } else {
    let activeContinuousIdx: number | null = null
    const getContinuousSlot = (t: number, i: number) =>
      isGlobal ? (i / Math.max(1, points.length - 1)) * 240 : (useFullSpectrum ? slotOfFullTrend(t) : slotOf(t))

    if (opts.hoverSlot != null && points.length > 0) {
      let minDiff = 999
      for (let i = 0; i < points.length; i++) {
        const slot = getContinuousSlot(points[i].time, i)
        const diff = Math.abs(slot - opts.hoverSlot)
        if (diff < minDiff) {
          minDiff = diff
          activeContinuousIdx = i
        }
      }
    }
    const minuteMacd = computeMinuteMacd(points, opts.macdParams)
    drawMacdSubchart({
      ctx,
      plotL,
      plotW,
      volT,
      volH,
      subPlotH,
      series: minuteMacd,
      getX: (i) => xOf(getContinuousSlot(points[i].time, i)),
      barWidth: Math.max(1, (plotW / totalSlots) * 0.72),
      activeIdx: activeContinuousIdx,
    })
  }

  // --- crosshair on hover -------------------------------------------------
  if (opts.hoverSlot != null && pricePoints.length > 0) {
    let closest = pricePoints[0]
    let minDiff = 999
    for (const p of pricePoints) {
      const diff = Math.abs(p.slot - opts.hoverSlot)
      if (diff < minDiff) {
        minDiff = diff
        closest = p
      }
    }
    const hx = xOf(closest.slot)
    const hy = yOf(closest.price)

    drawCrosshair(ctx, {
      x: hx,
      y: hy,
      plotL,
      plotW,
      plotT,
      plotH: priceH + volGap + volH,
      color: 'rgba(255,255,255,0.45)',
      dash: [2, 2],
      dotRadius: 2.5,
    })
  }

  // Draw cost & price levels
  const costLabel = (() => {
    if (!opts.costPrice || opts.costPrice <= 0) return undefined
    if (opts.lastPrice && opts.lastPrice > 0) {
      const pct = ((opts.lastPrice - opts.costPrice) / opts.costPrice) * 100
      const sign = pct >= 0 ? '+' : ''
      return `成本 ${opts.costPrice.toFixed(2)} (${sign}${pct.toFixed(2)}%)`
    }
    return `成本 ${opts.costPrice.toFixed(2)}`
  })()

  drawHorizontalLevel(ctx, {
    price: opts.costPrice && opts.costPrice > 0 ? opts.costPrice : null,
    yMin,
    yTop,
    yOf,
    plotL,
    plotW,
    plotT,
    plotH: priceH,
    color: theme.costLine,
    dash: [5, 2, 1, 2],
    label: costLabel,
  })

  for (const pl of opts.priceLines ?? []) {
    drawHorizontalLevel(ctx, {
      price: pl.price,
      yMin,
      yTop,
      yOf,
      plotL,
      plotW,
      plotT,
      plotH: priceH,
      color: theme.lineColor,
      dash: [2, 3],
      label: pl.label ?? undefined,
    })
  }

  const hasPastOrb = points.length > 0 && points[points.length - 1].time > 945
  if (hasPastOrb && opts.orbHigh && opts.orbHigh > 0) {
    drawHorizontalLevel(ctx, {
      price: opts.orbHigh,
      yMin,
      yTop,
      yOf,
      plotL,
      plotW,
      plotT,
      plotH: priceH,
      color: 'rgba(248, 113, 113, 0.45)',
      dash: [3, 2],
      label: 'H15',
    })
  }
  if (hasPastOrb && opts.orbLow && opts.orbLow > 0) {
    drawHorizontalLevel(ctx, {
      price: opts.orbLow,
      yMin,
      yTop,
      yOf,
      plotL,
      plotW,
      plotT,
      plotH: priceH,
      color: 'rgba(74, 222, 128, 0.45)',
      dash: [3, 2],
      label: 'L15',
    })
  }
}
