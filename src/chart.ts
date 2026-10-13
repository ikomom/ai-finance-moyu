// Hand-drawn A股 分时图.
//
// A general charting library fights this chart's conventions, so it is drawn
// directly on a canvas:
//
//   * Red is up, green is down (inverted from Western markets).
//   * The x-axis is 240 equal slots covering 9:30–11:30 and 13:00–15:00 with
//     **no gap** for the lunch break — 11:30 runs straight into 13:00.
//   * The y-axis is symmetric about 昨收, so the previous close sits dead centre
//     and the left/right scales read as price and percent deviation.
//   * The 均价线 (average price) is mandatory, and the feed only gives
//     cumulative volume/amount, so it is derived per point.

import { AVG, DOWN, UP, type PriceLine, type Trend } from './types'

const MORNING_START = 9 * 60 + 30 // 09:30
const MORNING_END = 11 * 60 + 30 // 11:30
const SLOTS = 240 // 241 points: indices 0..240

const GRID = 'rgba(255,255,255,0.07)'
const AXIS_TEXT = 'rgba(255,255,255,0.42)'
const PRE_CLOSE_LINE = 'rgba(255,255,255,0.28)'
const COST_LINE = '#22d3ee'
const LINE_COLOR = 'rgba(255,255,255,0.55)'
const FONT = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace'

export interface DrawOptions {
  trend: Trend | undefined
  /** Fallback 昨收 when the trend payload hasn't arrived yet. */
  preClose: number
  costPrice?: number | null
  priceLines?: PriceLine[]
  /** Latest price, marked with a dot at the end of the series. */
  lastPrice?: number
  compact?: boolean
  hoverSlot?: number | null
  orbHigh?: number | null
  orbLow?: number | null
}

export function isValidAvg(avgPrice: number, preClose: number): boolean {
  if (!avgPrice || avgPrice <= 0 || !Number.isFinite(avgPrice)) return false
  if (preClose > 0 && Math.abs(avgPrice - preClose) > preClose * 0.3) return false
  return true
}

/**
 * Map an `HHMM` stamp onto its x slot (0..240).
 *
 * The lunch break is collapsed: 09:30 is slot 0, 11:30 is slot 120, and the
 * afternoon picks up at slot 121 with 13:01. Anything outside the session
 * clamps to an end so a stray pre-open print can't stretch the axis.
 */
const AFTERNOON_START = 13 * 60 // 13:00

export function slotOf(hhmm: number): number {
  const h = Math.floor(hhmm / 100)
  const m = hhmm % 100
  const min = h * 60 + m
  if (min <= MORNING_END) {
    return clamp(min - MORNING_START, 0, 120)
  }
  if (min < AFTERNOON_START) {
    return 120
  }
  return clamp(min - 660, 120, SLOTS)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function drawTrend(canvas: HTMLCanvasElement, opts: DrawOptions): void {
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  if (cssW <= 0 || cssH <= 0) return

  const pxW = Math.round(cssW * dpr)
  const pxH = Math.round(cssH * dpr)
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW
    canvas.height = pxH
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)
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


  const points = opts.trend?.points ?? []
  const preClose = opts.preClose || opts.trend?.preClose || 0

  // Surfaced for diagnostics: lets a blank or clipped chart be told apart from a
  // mis-measured one without reaching for the webview console.
  canvas.dataset.geom =
    `css=${Math.round(cssW)}x${Math.round(cssH)} pad=${pad.left}/${pad.right}` +
    ` plot=${plotL}+${Math.round(plotW)}x${Math.round(plotH)}`
  canvas.dataset.points = String(points.length)

  // --- y range: symmetric about 昨收 -------------------------------------
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
    // Keep a flat stock from collapsing to a zero-height band, and keep lines
    // that sit inside the range (cost, user levels) from being clipped away.
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

  const yMin = preClose - maxDev
  const yTop = preClose + maxDev
  const span = yTop - yMin || 1

  const xOf = (slot: number) => plotL + (slot / SLOTS) * plotW
  const yOf = (price: number) => plotT + (1 - (price - yMin) / span) * plotH

  // --- grid ---------------------------------------------------------------
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = Math.round(plotT + (i / 4) * plotH) + 0.5
    ctx.beginPath()
    ctx.moveTo(plotL, y)
    ctx.lineTo(plotL + plotW, y)
    ctx.stroke()
  }
  for (const slot of [0, 60, 120, 180, 240]) {
    const x = Math.round(xOf(slot)) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, plotT)
    ctx.lineTo(x, plotT + plotH)
    ctx.stroke()
  }

  // --- 昨收 baseline (the centre line) ------------------------------------
  const yPre = yOf(preClose)
  ctx.save()
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = PRE_CLOSE_LINE
  ctx.beginPath()
  ctx.moveTo(plotL, yPre)
  ctx.lineTo(plotL + plotW, yPre)
  ctx.stroke()
  ctx.restore()

  // --- axis labels --------------------------------------------------------
  ctx.fillStyle = AXIS_TEXT
  const fmtPrice = (v: number) => (preClose >= 1000 ? v.toFixed(1) : v.toFixed(2))
  const step = maxDev / 2

  ctx.textAlign = 'right'
  for (let i = -2; i <= 2; i++) {
    const price = preClose + i * step
    const y = yOf(price)
    if (y < plotT - 1 || y > plotT + plotH + 1) continue
    ctx.fillText(fmtPrice(price), plotL - 3, y)
  }

  ctx.textAlign = 'left'
  if (preClose > 0) {
    for (let i = -2; i <= 2; i++) {
      const pct = ((i * step) / preClose) * 100
      const y = yOf(preClose + i * step)
      if (y < plotT - 1 || y > plotT + plotH + 1) continue
      ctx.fillText(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, plotL + plotW + 3, y)
    }
  }

  ctx.textAlign = 'center'
  const timeLabels: Array<[number, string]> = [
    [0, '9:30'],
    [120, '11:30/13:00'],
    [240, '15:00'],
  ]
  for (const [slot, label] of timeLabels) {
    let x = xOf(slot)
    if (slot === 0) {
      ctx.textAlign = 'left'
      x = plotL
    } else if (slot === SLOTS) {
      ctx.textAlign = 'right'
      x = plotL + plotW
    } else {
      ctx.textAlign = 'center'
    }
    ctx.fillText(label, x, plotT + plotH + 7)
  }

  if (points.length === 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = AXIS_TEXT
    ctx.fillText('暂无分时数据', plotL + plotW / 2, plotT + plotH / 2)
    return
  }

  // --- price line, coloured by direction vs 昨收 ---------------------------
  const up = (opts.lastPrice ?? points[points.length - 1].price) >= preClose
  const priceColor = up ? UP : DOWN

  const path = new Path2D()
  const fill = new Path2D()
  points.forEach((p, i) => {
    const x = xOf(slotOf(p.time))
    const y = yOf(p.price)
    if (i === 0) {
      path.moveTo(x, y)
      fill.moveTo(x, yPre)
      fill.lineTo(x, y)
    } else {
      path.lineTo(x, y)
      fill.lineTo(x, y)
    }
  })
  const lastX = xOf(slotOf(points[points.length - 1].time))
  fill.lineTo(lastX, yPre)
  fill.closePath()

  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.fillStyle = priceColor
  ctx.fill(fill)
  ctx.restore()

  ctx.strokeStyle = priceColor
  ctx.lineWidth = 1.2
  ctx.lineJoin = 'round'
  ctx.stroke(path)

  // --- 均价线 (仅在均价数据有效时绘制) -----------------------------------
  const validAvgPoints = points.filter((p) => isValidAvg(p.avgPrice, preClose))
  if (validAvgPoints.length >= Math.max(1, Math.floor(points.length * 0.4))) {
    const avgPath = new Path2D()
    validAvgPoints.forEach((p, i) => {
      const x = xOf(slotOf(p.time))
      const y = yOf(p.avgPrice)
      if (i === 0) avgPath.moveTo(x, y)
      else avgPath.lineTo(x, y)
    })
    ctx.strokeStyle = AVG
    ctx.lineWidth = 1
    ctx.stroke(avgPath)
  }

  // --- latest price dot ---------------------------------------------------
  const lastY = yOf(points[points.length - 1].price)
  ctx.fillStyle = priceColor
  ctx.beginPath()
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2)
  ctx.fill()

  // --- crosshair on hover -------------------------------------------------
  if (opts.hoverSlot != null && points.length > 0) {
    const targetSlot = opts.hoverSlot
    let closest = points[0]
    let minDiff = 999
    for (const p of points) {
      const diff = Math.abs(slotOf(p.time) - targetSlot)
      if (diff < minDiff) {
        minDiff = diff
        closest = p
      }
    }
    const hx = xOf(slotOf(closest.time))
    const hy = yOf(closest.price)

    ctx.save()
    ctx.setLineDash([2, 2])
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1

    // Vertical line
    ctx.beginPath()
    ctx.moveTo(hx, plotT)
    ctx.lineTo(hx, plotT + plotH)
    ctx.stroke()

    // Horizontal line
    ctx.beginPath()
    ctx.moveTo(plotL, hy)
    ctx.lineTo(plotL + plotW, hy)
    ctx.stroke()

    // Hover dot
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(hx, hy, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  drawHorizontalLevel(ctx, {
    price: opts.costPrice && opts.costPrice > 0 ? opts.costPrice : null,
    yMin,
    yTop,
    yOf,
    plotL,
    plotW,
    plotT,
    plotH,
    color: COST_LINE,
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
      plotH,
      color: LINE_COLOR,
      dash: [2, 3],
      label: pl.label ?? undefined,
    })
  }

  // Opening Range Breakout (ORB) boundaries after 09:45
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
      plotH,
      color: 'rgba(248, 113, 113, 0.45)', // subtle red dashed line for H15
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
      plotH,
      color: 'rgba(74, 222, 128, 0.45)', // subtle green dashed line for L15
      dash: [3, 2],
      label: 'L15',
    })
  }
}

interface LevelOptions {
  price: number | null
  yMin: number
  yTop: number
  yOf: (price: number) => number
  plotL: number
  plotW: number
  plotT: number
  plotH: number
  color: string
  dash: number[]
  label?: string
}

/**
 * Draw a horizontal level. A level outside the symmetric y-range is pinned to
 * the nearest edge and marked with a caret instead of being allowed to stretch
 * the axis — a cost price 20% below 昨收 must not flatten the day's curve into a
 * straight line.
 */
function drawHorizontalLevel(ctx: CanvasRenderingContext2D, o: LevelOptions): void {
  if (o.price === null || !Number.isFinite(o.price)) return

  const bottom = o.plotT + o.plotH
  const inRange = o.price >= o.yMin && o.price <= o.yTop
  const y = inRange ? o.yOf(o.price) : o.price > o.yTop ? o.plotT : bottom

  ctx.save()
  ctx.setLineDash(o.dash)
  ctx.strokeStyle = o.color
  ctx.globalAlpha = inRange ? 0.9 : 0.5
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(o.plotL, y + 0.5)
  ctx.lineTo(o.plotL + o.plotW, y + 0.5)
  ctx.stroke()
  ctx.restore()

  if (!inRange) {
    // Caret pointing off-edge: the level is beyond what the axis shows.
    const cx = o.plotL + o.plotW - 6
    const dir = o.price > o.yTop ? 1 : -1
    ctx.save()
    ctx.fillStyle = o.color
    ctx.beginPath()
    ctx.moveTo(cx - 3, y + dir * 4)
    ctx.lineTo(cx + 3, y + dir * 4)
    ctx.lineTo(cx, y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  if (o.label) {
    ctx.save()
    ctx.fillStyle = o.color
    ctx.textAlign = 'left'
    ctx.font = FONT
    ctx.fillText(
      o.label,
      o.plotL + 2,
      y + (o.price !== null && o.price > o.yTop ? 6 : -6),
    )
    ctx.restore()
  }
}

/**
 * Draw a mini Sparkline for a stock row (used in compact list).
 * Height ~16-20px, width ~50-80px.
 */
export function drawSparkline(
  canvas: HTMLCanvasElement,
  trend: Trend | undefined,
  preClose: number,
  lastPrice?: number
): void {
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  if (cssW <= 0 || cssH <= 0) return

  const pxW = Math.round(cssW * dpr)
  const pxH = Math.round(cssH * dpr)
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW
    canvas.height = pxH
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)

  const points = trend?.points ?? []
  const pc = preClose || trend?.preClose || 0
  const cur = lastPrice ?? (points.length > 0 ? points[points.length - 1].price : pc)

  if (points.length < 2 || pc <= 0) {
    // Subtle baseline when no trend data is available
    ctx.save()
    ctx.setLineDash([2, 2])
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.round(cssH / 2) + 0.5)
    ctx.lineTo(cssW, Math.round(cssH / 2) + 0.5)
    ctx.stroke()
    ctx.restore()
    return
  }

  let maxDev = 0
  for (const p of points) {
    if (p.price > 0) {
      maxDev = Math.max(maxDev, Math.abs(p.price - pc))
    }
  }
  maxDev = Math.max(maxDev, pc * 0.002)

  const yMin = pc - maxDev
  const yTop = pc + maxDev
  const span = yTop - yMin || 1

  const padT = 2
  const padB = 2
  const plotH = Math.max(1, cssH - padT - padB)
  const xOf = (slot: number) => (slot / SLOTS) * cssW
  const yOf = (price: number) => padT + (1 - (price - yMin) / span) * plotH

  const up = cur >= pc
  const color = up ? UP : DOWN

  // Baseline
  const yPre = yOf(pc)
  ctx.save()
  ctx.setLineDash([2, 2])
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(0, Math.round(yPre) + 0.5)
  ctx.lineTo(cssW, Math.round(yPre) + 0.5)
  ctx.stroke()
  ctx.restore()

  // Curve and area fill
  const path = new Path2D()
  const fill = new Path2D()

  points.forEach((p, i) => {
    const x = xOf(slotOf(p.time))
    const y = yOf(p.price)
    if (i === 0) {
      path.moveTo(x, y)
      fill.moveTo(x, yPre)
      fill.lineTo(x, y)
    } else {
      path.lineTo(x, y)
      fill.lineTo(x, y)
    }
  })

  const lastX = xOf(slotOf(points[points.length - 1].time))
  fill.lineTo(lastX, yPre)
  fill.closePath()

  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.fillStyle = color
  ctx.fill(fill)
  ctx.restore()

  ctx.strokeStyle = color
  ctx.lineWidth = 1.1
  ctx.lineJoin = 'round'
  ctx.stroke(path)

  const lastY = yOf(points[points.length - 1].price)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2)
  ctx.fill()
}

