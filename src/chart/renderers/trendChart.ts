import { computeMinuteMacd } from '../../utils/indicators'
import { drawCrosshair, drawHorizontalLevel, setupCanvasDpi } from '../canvasUtils'
import { FONT, getChartTheme } from '../theme'
import type { DrawOptions } from '../types'
import { SLOTS } from '../scale'
import { computeMaxDev, drawGrid, drawPriceAxis, drawTimeAxis, makeSlotResolver, type PlotGeometry } from './trendAxes'
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

  canvas.dataset.geom =
    `css=${Math.round(cssW)}x${Math.round(cssH)} pad=${pad.left}/${pad.right}` +
    ` plot=${plotL}+${Math.round(plotW)}x${Math.round(plotH)}`
  canvas.dataset.points = String(points.length)

  // --- y range: symmetric about 昨收 -------------------------------------
  const maxDev = computeMaxDev(points, preClose, opts)

  const yMin = preClose - maxDev
  const yTop = preClose + maxDev
  const span = yTop - yMin || 1

  const isGlobal = opts.isGlobal ?? false
  const getSlot = makeSlotResolver(isGlobal, points.length)

  const xOf = (slot: number) => plotL + (slot / SLOTS) * plotW
  const yOf = (price: number) => plotT + (1 - (price - yMin) / span) * priceH

  const geo: PlotGeometry = { plotL, plotT, plotW, priceH, volT, volH }

  // --- grid ---------------------------------------------------------------
  drawGrid(ctx, theme, geo)

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
  drawTimeAxis(ctx, geo, isGlobal, points)

  if (points.length === 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = theme.axisText
    ctx.fillText('暂无分时数据', plotL + plotW / 2, plotT + priceH / 2)
    return
  }

  // Draw main price curve & average price
  drawTrendPrice({
    ctx,
    points,
    preClose,
    lastPrice: opts.lastPrice,
    xOf,
    yOf,
    yPre,
    getSlot,
  })

  // --- subchart: switchable VOL vs MACD ------------------------------------
  const subMode = opts.subchartMode ?? 'vol'

  let activeIdx: number | null = null
  if (opts.hoverSlot != null) {
    let minDiff = 999
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(getSlot(points[i].time, i) - opts.hoverSlot)
      if (diff < minDiff) {
        minDiff = diff
        activeIdx = i
      }
    }
  }

  if (subMode === 'vol') {
    const minuteVols: number[] = new Array(points.length)
    const isUpList: boolean[] = new Array(points.length)
    for (let i = 0; i < points.length; i++) {
      minuteVols[i] = i === 0 ? points[0].cumVolume : Math.max(0, points[i].cumVolume - points[i - 1].cumVolume)
      isUpList[i] = i === 0 ? points[0].price >= preClose : points[i].price >= points[i - 1].price
    }
    const barW = Math.max(1, (plotW / SLOTS) * 0.82)
    drawMinuteVolumeSubchart({
      ctx,
      plotL,
      plotW,
      volT,
      volH,
      subPlotH,
      volumes: minuteVols,
      isUpList,
      getX: (i) => xOf(getSlot(points[i].time, i)),
      barWidth: barW,
      activeIdx,
    })
  } else {
    const minuteMacd = computeMinuteMacd(points, opts.macdParams)
    drawMacdSubchart({
      ctx,
      plotL,
      plotW,
      volT,
      volH,
      subPlotH,
      series: minuteMacd,
      getX: (i) => xOf(getSlot(points[i].time, i)),
      barWidth: Math.max(1, (plotW / SLOTS) * 0.72),
      activeIdx,
    })
  }

  // --- crosshair on hover -------------------------------------------------
  if (opts.hoverSlot != null && points.length > 0) {
    const targetSlot = opts.hoverSlot
    let closest = points[0]
    let closestIdx = 0
    let minDiff = 999
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const diff = Math.abs(getSlot(p.time, i) - targetSlot)
      if (diff < minDiff) {
        minDiff = diff
        closest = p
        closestIdx = i
      }
    }
    const hx = xOf(getSlot(closest.time, closestIdx))
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

  // Draw levels
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
    label: opts.costPrice && opts.costPrice > 0 ? '成本' : undefined,
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
