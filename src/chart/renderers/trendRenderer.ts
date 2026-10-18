import { AVG, DOWN, UP } from '../theme'
import { isValidAvg } from '../scale'
import type { TrendPoint } from '../../types'

export interface DrawTrendPriceOptions {
  ctx: CanvasRenderingContext2D
  points: TrendPoint[]
  preClose: number
  lastPrice?: number
  xOf: (slot: number) => number
  yOf: (price: number) => number
  yPre: number
  getSlot: (time: number, idx: number) => number
}

export function drawTrendPrice(opts: DrawTrendPriceOptions): { lastX: number; lastY: number; priceColor: string } | null {
  const { ctx, points, preClose, lastPrice, xOf, yOf, yPre, getSlot } = opts
  if (points.length === 0) return null

  const up = (lastPrice ?? points[points.length - 1].price) >= preClose
  const priceColor = up ? UP : DOWN

  const path = new Path2D()
  const fill = new Path2D()
  points.forEach((p, i) => {
    const x = xOf(getSlot(p.time, i))
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
  const lastIdx = points.length - 1
  const lastX = xOf(getSlot(points[lastIdx].time, lastIdx))
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

  // 均价线 (仅在均价数据有效时绘制)
  const validAvgPoints = points.filter((p) => isValidAvg(p.avgPrice, preClose))
  if (validAvgPoints.length >= Math.max(1, Math.floor(points.length * 0.4))) {
    const avgPath = new Path2D()
    validAvgPoints.forEach((p, i) => {
      const idx = points.indexOf(p)
      const x = xOf(getSlot(p.time, idx >= 0 ? idx : i))
      const y = yOf(p.avgPrice)
      if (i === 0) avgPath.moveTo(x, y)
      else avgPath.lineTo(x, y)
    })
    ctx.strokeStyle = AVG
    ctx.lineWidth = 1
    ctx.stroke(avgPath)
  }

  // Latest price dot
  const lastY = yOf(points[lastIdx].price)
  ctx.fillStyle = priceColor
  ctx.beginPath()
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2)
  ctx.fill()

  return { lastX, lastY, priceColor }
}
