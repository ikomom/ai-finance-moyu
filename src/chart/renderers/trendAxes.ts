//! Axes, grid and scale helpers for the intraday trend chart.
//!
//! Extracted from `trendChart.ts` so that file keeps the drawing flow while the
//! axis arithmetic lives on its own (and both stay inside the 300-line budget,
//! AGENTS.md §11).

import type { TrendPoint } from '../../types'
import type { DrawOptions } from '../types'
import { getChartTheme } from '../theme'
import { isValidAvg, SLOTS, slotOf } from '../scale'

export interface PlotGeometry {
  plotL: number
  plotT: number
  plotW: number
  priceH: number
  volT: number
  volH: number
}

/** Symmetric price deviation around 昨收, widened to keep nearby overlays on screen. */
export function computeMaxDev(
  points: ReadonlyArray<TrendPoint>,
  preClose: number,
  opts: DrawOptions
): number {
  let maxDev = 0
  for (const p of points) {
    if (p.price > 0) {
      maxDev = Math.max(maxDev, Math.abs(p.price - preClose))
    }
    if (isValidAvg(p.avgPrice, preClose)) {
      maxDev = Math.max(maxDev, Math.abs(p.avgPrice - preClose))
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

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  theme: ReturnType<typeof getChartTheme>,
  geo: PlotGeometry
): void {
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

  for (const slot of [0, 60, 120, 180, 240]) {
    const x = Math.round(geo.plotL + (slot / SLOTS) * geo.plotW) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, geo.plotT)
    ctx.lineTo(x, geo.volT + geo.volH)
    ctx.stroke()
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

/** Bottom time axis; global indices label the real clock, A-shares the session. */
export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  geo: PlotGeometry,
  isGlobal: boolean,
  points: ReadonlyArray<{ time: number }>
): void {
  const xOf = (slot: number) => geo.plotL + (slot / SLOTS) * geo.plotW

  const timeLabels: Array<[number, string]> =
    isGlobal && points.length > 0
      ? [
          [0, fmtHhmm(points[0].time)],
          [120, fmtHhmm(points[Math.floor(points.length / 2)].time)],
          [240, fmtHhmm(points[points.length - 1].time)],
        ]
      : [
          [0, '9:30'],
          [120, '11:30/13:00'],
          [240, '15:00'],
        ]

  ctx.textAlign = 'center'
  for (const [slot, label] of timeLabels) {
    let x = xOf(slot)
    if (slot === 0) {
      ctx.textAlign = 'left'
      x = geo.plotL
    } else if (slot === SLOTS) {
      ctx.textAlign = 'right'
      x = geo.plotL + geo.plotW
    } else {
      ctx.textAlign = 'center'
    }
    ctx.fillText(label, x, geo.volT + geo.volH + 7)
  }
}

/** Slot mapping: global indices are evenly spread, A-shares map by clock time. */
export function makeSlotResolver(
  isGlobal: boolean,
  pointCount: number
): (time: number, idx: number) => number {
  if (isGlobal) {
    return (_time: number, idx: number) => (idx / Math.max(1, pointCount - 1)) * SLOTS
  }
  return (time: number) => slotOf(time)
}
