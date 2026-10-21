//! Axes, grid and scale helpers for the intraday trend chart.
//!
//! Extracted from `trendChart.ts` so that file keeps the drawing flow while the
//! axis arithmetic lives on its own (and both stay inside the 300-line budget,
//! AGENTS.md §11).

import type { TrendPoint } from '../../types'
import type { DrawOptions } from '../types'
import { getChartTheme } from '../theme'
import {
  AUCTION_MORNING_SLOT_END,
  CLOSING_AUCTION_SLOT_END,
  FULL_SLOTS,
  PRETRADE_SLOT_END,
  SLOTS,
  slotOf,
  slotOfFullTrend,
} from '../scale'
import { computeUnifiedMaxDev } from './trendData'

export interface PlotGeometry {
  plotL: number
  plotT: number
  plotW: number
  priceH: number
  volT: number
  volH: number
}

export function computeMaxDev(
  points: ReadonlyArray<TrendPoint>,
  preClose: number,
  opts: DrawOptions
): number {
  return computeUnifiedMaxDev(points, preClose, opts)
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  theme: ReturnType<typeof getChartTheme>,
  geo: PlotGeometry,
  isGlobal = false,
  useFullSpectrum = false
): void {
  const totalSlots = isGlobal ? SLOTS : (useFullSpectrum ? FULL_SLOTS : SLOTS)
  const xOf = (slot: number) => geo.plotL + (slot / totalSlots) * geo.plotW
  const fullPlotH = geo.priceH + (geo.volT - (geo.plotT + geo.priceH)) + geo.volH

  // Phase shading for A-shares
  if (!isGlobal) {
    if (useFullSpectrum) {
      // 09:15-09:20: Morning auction with cancellation allowed (subtle amber)
      const x0 = xOf(0)
      const x5 = xOf(5)
      ctx.fillStyle = 'rgba(245, 158, 11, 0.025)'
      ctx.fillRect(x0, geo.plotT, x5 - x0, fullPlotH)

      // 09:20-09:25: Morning auction no cancellation (subtle blue)
      const x10 = xOf(AUCTION_MORNING_SLOT_END)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.025)'
      ctx.fillRect(x5, geo.plotT, x10 - x5, fullPlotH)

      // 14:57-15:00: Closing auction (subtle blue)
      const x252 = xOf(252)
      const x255 = xOf(CLOSING_AUCTION_SLOT_END)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.025)'
      ctx.fillRect(x252, geo.plotT, x255 - x252, fullPlotH)
    } else {
      // Standard 240-slot mode: 14:57-15:00 closing auction zone (slot 237..240)
      const x237 = xOf(237)
      const x240 = xOf(SLOTS)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.025)'
      ctx.fillRect(x237, geo.plotT, x240 - x237, fullPlotH)
    }
  }

  // Horizontal price grid lines
  ctx.strokeStyle = theme.grid
  ctx.lineWidth = 1

  for (let i = 0; i <= 4; i++) {
    const y = Math.round(geo.plotT + (i / 4) * geo.priceH) + 0.5
    ctx.beginPath()
    ctx.moveTo(geo.plotL, y)
    ctx.lineTo(geo.plotL + geo.plotW, y)
    ctx.stroke()
  }

  // Volume subchart top separator
  ctx.beginPath()
  ctx.moveTo(geo.plotL, Math.round(geo.volT) - 0.5)
  ctx.lineTo(geo.plotL + geo.plotW, Math.round(geo.volT) - 0.5)
  ctx.stroke()

  // Vertical time grid lines
  if (isGlobal || !useFullSpectrum) {
    // Standard 5-column equidistant grid (0, 60, 120, 180, 240)
    for (const slot of [0, 60, 120, 180, SLOTS]) {
      const x = Math.round(geo.plotL + (slot / SLOTS) * geo.plotW) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, geo.plotT)
      ctx.lineTo(x, geo.volT + geo.volH)
      ctx.stroke()
    }
    // 14:57 demarcation line in standard mode
    if (!isGlobal) {
      ctx.save()
      ctx.setLineDash([2, 2])
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      const x237 = Math.round(xOf(237)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x237, geo.plotT)
      ctx.lineTo(x237, geo.volT + geo.volH)
      ctx.stroke()
      ctx.restore()
    }
  } else {
    // Full spectrum mode (09:15, 09:30, 11:30/13:00, 15:00)
    for (const slot of [0, PRETRADE_SLOT_END, 135, FULL_SLOTS]) {
      const x = Math.round(xOf(slot)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, geo.plotT)
      ctx.lineTo(x, geo.volT + geo.volH)
      ctx.stroke()
    }

    // Demarcation dashed lines (09:20 and 14:57)
    ctx.save()
    ctx.setLineDash([2, 2])
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    for (const slot of [5, 252]) {
      const x = Math.round(xOf(slot)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, geo.plotT)
      ctx.lineTo(x, geo.volT + geo.volH)
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Price on the left, percentage on the right. */
export function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  theme: ReturnType<typeof getChartTheme>,
  geo: PlotGeometry,
  preClose: number,
  maxDev: number,
  yOf: (price: number) => number
): void {
  ctx.fillStyle = theme.axisText
  const fmtP = (v: number) => (preClose >= 1000 ? v.toFixed(1) : v.toFixed(2))
  const step = maxDev / 2

  ctx.textAlign = 'right'
  for (let i = -2; i <= 2; i++) {
    const price = preClose + i * step
    const y = yOf(price)
    if (y < geo.plotT - 1 || y > geo.plotT + geo.priceH + 1) continue
    ctx.fillText(fmtP(price), geo.plotL - 3, y)
  }

  ctx.textAlign = 'left'
  if (preClose > 0) {
    for (let i = -2; i <= 2; i++) {
      const pct = ((i * step) / preClose) * 100
      const y = yOf(preClose + i * step)
      if (y < geo.plotT - 1 || y > geo.plotT + geo.priceH + 1) continue
      ctx.fillText(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, geo.plotL + geo.plotW + 3, y)
    }
  }
}

function fmtHhmm(t: number): string {
  const h = Math.floor(t / 100).toString().padStart(2, '0')
  const m = (t % 100).toString().padStart(2, '0')
  return `${h}:${m}`
}

/** Bottom time axis; never crowd labels to avoid overlapping text. */
export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  geo: PlotGeometry,
  isGlobal: boolean,
  points: ReadonlyArray<{ time: number }>,
  useFullSpectrum = false
): void {
  const totalSlots = isGlobal ? SLOTS : (useFullSpectrum ? FULL_SLOTS : SLOTS)
  const xOf = (slot: number) => geo.plotL + (slot / totalSlots) * geo.plotW

  const timeLabels: Array<[number, string]> =
    isGlobal && points.length > 0
      ? [
          [0, fmtHhmm(points[0].time)],
          [120, fmtHhmm(points[Math.floor(points.length / 2)].time)],
          [240, fmtHhmm(points[points.length - 1].time)],
        ]
      : useFullSpectrum
        ? [
            [0, '9:15'],
            [135, '11:30/13:00'],
            [FULL_SLOTS, '15:00'],
          ]
        : [
            [0, '9:30'],
            [120, '11:30/13:00'],
            [SLOTS, '15:00'],
          ]

  for (const [slot, label] of timeLabels) {
    let x = xOf(slot)
    if (slot === 0) {
      ctx.textAlign = 'left'
      x = geo.plotL
    } else if (slot === totalSlots) {
      ctx.textAlign = 'right'
      x = geo.plotL + geo.plotW
    } else {
      ctx.textAlign = 'center'
    }
    ctx.fillText(label, x, geo.volT + geo.volH + 7)
  }
}

/** Slot mapping: resolves clock time to the appropriate slot index. */
export function makeSlotResolver(
  isGlobal: boolean,
  pointCount: number,
  useFullSpectrum = false
): (time: number, idx: number) => number {
  if (isGlobal) {
    return (_time: number, idx: number) => (idx / Math.max(1, pointCount - 1)) * SLOTS
  }
  if (useFullSpectrum) {
    return (time: number) => slotOfFullTrend(time)
  }
  return (time: number) => slotOf(time)
}
