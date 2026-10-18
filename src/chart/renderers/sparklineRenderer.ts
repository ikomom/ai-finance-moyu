import type { Trend } from '../../types'
import { DOWN, UP } from '../theme'
import { setupCanvasDpi } from '../canvasUtils'
import { SLOTS, slotOf } from '../scale'

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
  const dpi = setupCanvasDpi(canvas)
  if (!dpi) return
  const { ctx, cssW, cssH } = dpi

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
