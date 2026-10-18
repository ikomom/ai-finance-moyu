import { FONT } from './theme'
import type { LevelOptions } from './types'

export interface CanvasDpiContext {
  ctx: CanvasRenderingContext2D
  cssW: number
  cssH: number
  dpr: number
}

/**
 * Standardize Hi-DPI canvas initialization using setTransform to prevent matrix accumulation.
 */
export function setupCanvasDpi(
  canvas: HTMLCanvasElement,
  customCssW?: number,
  customCssH?: number
): CanvasDpiContext | null {
  const dpr = window.devicePixelRatio || 1
  const cssW = customCssW ?? canvas.clientWidth
  const cssH = customCssH ?? canvas.clientHeight
  if (cssW <= 0 || cssH <= 0) return null

  const pxW = Math.round(cssW * dpr)
  const pxH = Math.round(cssH * dpr)
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW
    canvas.height = pxH
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)
  return { ctx, cssW, cssH, dpr }
}

/**
 * Draw crisp dashed line.
 */
export function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number[],
  color: string,
  lineWidth = 1
): void {
  ctx.save()
  ctx.setLineDash(dash)
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw a horizontal level. A level outside the symmetric y-range is pinned to
 * the nearest edge and marked with a caret instead of being allowed to stretch
 * the axis.
 */
export function drawHorizontalLevel(ctx: CanvasRenderingContext2D, o: LevelOptions): void {
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
 * Draw crosshair lines and center indicator dot.
 */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number
    y: number
    plotL: number
    plotW: number
    plotT: number
    plotH: number
    color?: string
    dash?: number[]
    dotRadius?: number
  }
): void {
  const {
    x,
    y,
    plotL,
    plotW,
    plotT,
    plotH,
    color = 'rgba(255, 255, 255, 0.45)',
    dash = [2, 2],
    dotRadius = 2.5,
  } = opts

  ctx.save()
  ctx.setLineDash(dash)
  ctx.strokeStyle = color
  ctx.lineWidth = 1

  // Vertical line
  ctx.beginPath()
  ctx.moveTo(x, plotT)
  ctx.lineTo(x, plotT + plotH)
  ctx.stroke()

  // Horizontal line
  ctx.beginPath()
  ctx.moveTo(plotL, y)
  ctx.lineTo(plotL + plotW, y)
  ctx.stroke()

  // Dot
  if (dotRadius > 0) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Draw pill badge for axis hover values.
 */
export function drawPillBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  bgColor = '#1e293b',
  textColor = '#f8fafc'
): void {
  ctx.save()
  ctx.font = FONT
  const padH = 4
  const padV = 2
  const metrics = ctx.measureText(text)
  const tw = metrics.width
  const th = 9 // font size
  const w = tw + padH * 2
  const h = th + padV * 2

  const x = cx - w / 2
  const y = cy - h / 2

  ctx.fillStyle = bgColor
  ctx.beginPath()
  const r = 3
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h)
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.2)'
  ctx.lineWidth = 0.8
  ctx.stroke()

  ctx.fillStyle = textColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy)
  ctx.restore()
}
