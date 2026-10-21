import { AVG, DOWN, UP } from '../theme'
import { isValidAvg } from '../scale'
import type { UnifiedPricePoint } from './trendData'

export interface DrawTrendPriceOptions {
  ctx: CanvasRenderingContext2D
  points: UnifiedPricePoint[]
  preClose: number
  lastPrice?: number
  xOf: (slot: number) => number
  yOf: (price: number) => number
  yPre: number
}

export function drawTrendPrice(
  opts: DrawTrendPriceOptions
): { lastX: number; lastY: number; priceColor: string } | null {
  const { ctx, points, preClose, lastPrice, xOf, yOf, yPre } = opts
  if (points.length === 0) return null

  const lastPt = points[points.length - 1]
  const currentPrice = lastPrice ?? lastPt.price
  const up = currentPrice >= preClose
  const priceColor = up ? UP : DOWN

  const path = new Path2D()
  const fill = new Path2D()

  points.forEach((p, i) => {
    const x = xOf(p.slot)
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

  const lastX = xOf(lastPt.slot)
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

  // 均价线 (连续交易时段均价有效时绘制)
  const validAvgPoints = points.filter((p) => p.avgPrice && isValidAvg(p.avgPrice, preClose))
  if (validAvgPoints.length >= 2) {
    const avgPath = new Path2D()
    validAvgPoints.forEach((p, i) => {
      const x = xOf(p.slot)
      const y = yOf(p.avgPrice!)
      if (i === 0) avgPath.moveTo(x, y)
      else avgPath.lineTo(x, y)
    })
    ctx.strokeStyle = AVG
    ctx.lineWidth = 1
    ctx.stroke(avgPath)
  }

  // 最新价格圆点
  const lastY = yOf(lastPt.price)
  ctx.fillStyle = priceColor
  ctx.beginPath()
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2)
  ctx.fill()

  return { lastX, lastY, priceColor }
}
