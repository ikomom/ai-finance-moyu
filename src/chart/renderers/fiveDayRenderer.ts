//! 5-day continuous intraday trend renderer.
//!
//! Follows AGENTS.md §11 (colocation, <=300 lines) and §15 (theme adaptability).
//! Draws 5-day continuous price lines, day-separation dashed grid, volume bars,
//! independent moving average lines, trade markers, and crosshair interaction.

import type { DayTrend, MultiDayTrend, TradeRecord } from '../../types'
import { fmtVol } from '../../types'
import { getChartTheme } from '../theme'
import { slotOf } from '../scale'
import { groupIntradayTrades, type TradeMarkerGroup } from './tradePointsRenderer'

export interface DrawFiveDayOptions {
  multiTrend: MultiDayTrend
  costPrice?: number | null
  trades?: TradeRecord[]
  hoverDayIndex?: number | null
  hoverSlot?: number | null
}

export interface FiveDayHoverInfo {
  dayIndex: number
  day: DayTrend
  timeNum: number
  timeStr: string
  price: number
  avgPrice: number
  changePct: number
  volume: number
  amount: number
  matchedTrade?: TradeMarkerGroup
}

export function drawFiveDayTrend(
  canvas: HTMLCanvasElement,
  options: DrawFiveDayOptions
): FiveDayHoverInfo | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const days = options.multiTrend.days
  if (!days || days.length === 0) return null

  ctx.save()
  ctx.scale(dpr, dpr)

  const theme = getChartTheme()
  const N = days.length
  const dayWidth = w / N

  // Layout splits: 62% main price chart, 38% volume subchart
  const mainTop = 6, mainBottom = h * 0.62 - 4
  const mainHeight = mainBottom - mainTop, midY = mainTop + mainHeight / 2
  const volTop = h * 0.65, volBottom = h - 14, volHeight = Math.max(12, volBottom - volTop)

  // 1. Calculate unified relative amplitude across all days
  let maxPct = 0.015
  for (const day of days) {
    const pc = day.preClose > 0 ? day.preClose : (day.points[0]?.price ?? 1)
    for (const p of day.points) {
      const diff = Math.abs((p.price - pc) / pc)
      if (diff > maxPct) maxPct = diff
      if (p.avgPrice > 0) {
        const adiff = Math.abs((p.avgPrice - pc) / pc)
        if (adiff > maxPct) maxPct = adiff
      }
    }
  }
  maxPct = Math.min(0.2, maxPct * 1.1)

  const priceToY = (price: number, preClose: number) => {
    const pc = preClose > 0 ? preClose : price
    return midY - ((price - pc) / (pc * maxPct)) * (mainHeight * 0.44)
  }

  // 2. Day highlight and dividers
  for (let i = 0; i < N; i++) {
    const left = i * dayWidth
    if (options.hoverDayIndex === i) {
      const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
      ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.05)'
      ctx.fillRect(left, 0, dayWidth, volBottom)
    }
    if (i > 0) {
      ctx.beginPath()
      ctx.setLineDash([2, 2])
      ctx.strokeStyle = theme.grid
      ctx.moveTo(left, 0); ctx.lineTo(left, volBottom); ctx.stroke()
      ctx.setLineDash([])
    }
    const d = days[i].date
    const label = d.length === 8 ? `${d.slice(4, 6)}-${d.slice(6, 8)}` : d.slice(-5)
    ctx.font = theme.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = options.hoverDayIndex === i ? theme.lineColor : theme.axisText
    ctx.fillText(label, left + dayWidth / 2, volBottom + 2)
  }

  // Preclose baseline & Subchart top divider
  ctx.beginPath()
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = theme.grid
  ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.strokeStyle = theme.grid
  ctx.moveTo(0, volTop - 2); ctx.lineTo(w, volTop - 2); ctx.stroke()

  // 3. Find max volume for subchart
  let maxVol = 1
  for (const day of days) {
    let lastCum = 0
    for (const p of day.points) {
      const minVol = Math.max(0, p.cumVolume - lastCum)
      lastCum = p.cumVolume
      if (minVol > maxVol) maxVol = minVol
    }
  }

  // Subchart volume label
  ctx.font = '9px ui-monospace, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = theme.axisText
  ctx.fillText(`量(手) 高 ${fmtVol(maxVol)}`, 4, volTop - 1)

  // 4. Draw each day's price curve, avg line, and volume bars
  const dayTradesMap: Map<number, TradeMarkerGroup[]> = new Map()

  for (let i = 0; i < N; i++) {
    const day = days[i]
    const left = i * dayWidth
    const pc = day.preClose > 0 ? day.preClose : (day.points[0]?.price ?? 1)
    const pts = day.points
    if (pts.length === 0) continue

    const slotWidth = dayWidth / 241
    const barWidth = Math.max(1.2, slotWidth - 0.2)

    // A. Price Line
    ctx.beginPath()
    ctx.strokeStyle = theme.lineColor
    ctx.lineWidth = 1.2
    for (let k = 0; k < pts.length; k++) {
      const px = left + Math.min(240, slotOf(pts[k].time)) * slotWidth
      const py = priceToY(pts[k].price, pc)
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // B. Avg Price Line
    ctx.beginPath()
    ctx.strokeStyle = theme.avg
    ctx.lineWidth = 1
    for (let k = 0; k < pts.length; k++) {
      if (pts[k].avgPrice <= 0) continue
      const px = left + Math.min(240, slotOf(pts[k].time)) * slotWidth
      const py = priceToY(pts[k].avgPrice, pc)
      if (k === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()

    // C. Volume Bars (with power scaling so bars are prominently visible)
    let lastCum = 0
    let prevPrice = pc
    for (const p of pts) {
      const minVol = Math.max(0, p.cumVolume - lastCum)
      lastCum = p.cumVolume
      const px = left + Math.min(240, slotOf(p.time)) * slotWidth
      const ratio = Math.min(1, Math.max(0, minVol / maxVol))
      const barH = minVol > 0 ? Math.max(2, Math.pow(ratio, 0.65) * volHeight) : 0
      const by = volBottom - barH

      ctx.fillStyle = p.price >= prevPrice ? theme.up : theme.down
      ctx.fillRect(px - barWidth / 2, by, barWidth, barH)
      prevPrice = p.price
    }

    // D. Trade markers for this day
    const dayTrades = groupIntradayTrades(options.trades, day.date, false)
    if (dayTrades.length > 0) {
      dayTradesMap.set(i, dayTrades)
      for (const m of dayTrades) {
        const mx = left + Math.min(240, m.slot) * slotWidth
        const my = priceToY(m.avgPrice, pc)
        const badgeColor = m.type === 'B' ? theme.up : m.type === 'S' ? theme.down : '#eab308'

        ctx.beginPath()
        ctx.setLineDash([2, 2])
        ctx.strokeStyle = badgeColor
        ctx.moveTo(mx, my - 6); ctx.lineTo(mx, my + 6); ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = badgeColor
        ctx.fillRect(mx - 6, my - 13, 12, 10)
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 8px ui-monospace, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(m.type === 'T' ? 'T' : m.type, mx, my - 8)
      }
    }
  }

  // 5. Cost price horizontal line
  if (options.costPrice && options.costPrice > 0) {
    const pc = days[days.length - 1].preClose > 0 ? days[days.length - 1].preClose : options.costPrice
    const costY = priceToY(options.costPrice, pc)
    if (costY >= mainTop && costY <= mainBottom) {
      ctx.beginPath()
      ctx.setLineDash([3, 2])
      ctx.strokeStyle = theme.costLine
      ctx.lineWidth = 1
      ctx.moveTo(0, costY); ctx.lineTo(w, costY); ctx.stroke()
      ctx.setLineDash([])
    }
  }

  // 6. Crosshair & Hover details
  let hoverInfo: FiveDayHoverInfo | null = null
  const dIdx = options.hoverDayIndex
  const sIdx = options.hoverSlot
  if (dIdx != null && dIdx >= 0 && dIdx < N && sIdx != null && sIdx >= 0 && sIdx <= 240) {
    const day = days[dIdx]
    const pc = day.preClose > 0 ? day.preClose : 1
    const dayLeft = dIdx * dayWidth
    const slotWidth = dayWidth / 241
    const hx = dayLeft + sIdx * slotWidth

    let closestPt = day.points[0]
    let minSlotDiff = 9999
    let lastCum = 0
    let lastCumAmt = 0
    let hoveredVol = 0
    let hoveredAmt = 0

    for (const p of day.points) {
      const s = slotOf(p.time)
      const diff = Math.abs(s - sIdx)
      if (diff < minSlotDiff) {
        minSlotDiff = diff
        closestPt = p
        hoveredVol = Math.max(0, p.cumVolume - lastCum)
        hoveredAmt = Math.max(0, p.cumAmount - lastCumAmt)
      }
      lastCum = p.cumVolume
      lastCumAmt = p.cumAmount
    }

    if (closestPt) {
      const hy = priceToY(closestPt.price, pc)

      ctx.beginPath()
      ctx.strokeStyle = theme.axisText; ctx.lineWidth = 0.8
      ctx.setLineDash([2, 2])
      ctx.moveTo(hx, 0); ctx.lineTo(hx, volBottom)
      ctx.moveTo(0, hy); ctx.lineTo(w, hy); ctx.stroke()
      ctx.setLineDash([])

      ctx.beginPath()
      ctx.arc(hx, hy, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = closestPt.price >= pc ? theme.up : theme.down
      ctx.fill()
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke()

      const chgPct = pc > 0 ? (closestPt.price - pc) / pc : 0
      const matchedTrade = dayTradesMap.get(dIdx)?.find((m) => Math.abs(m.slot - sIdx) <= 4)
      const timeStr = `${String(Math.floor(closestPt.time / 100)).padStart(2, '0')}:${String(closestPt.time % 100).padStart(2, '0')}`

      hoverInfo = {
        dayIndex: dIdx,
        day,
        timeNum: closestPt.time,
        timeStr,
        price: closestPt.price,
        avgPrice: closestPt.avgPrice,
        changePct: chgPct,
        volume: hoveredVol,
        amount: hoveredAmt,
        matchedTrade,
      }
    }
  }

  ctx.restore()
  return hoverInfo
}
