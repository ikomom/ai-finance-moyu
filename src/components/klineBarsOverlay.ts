//! Candles, moving averages, timeline, legend and crosshair stages.

import { COLOR_MA10, COLOR_MA20, COLOR_MA5, diagnoseMacd, FONT } from '../chart'
import { DOWN, fmtPrice, fmtVol, UP } from '../types'
import type { KlinePaint } from './klinePaintTypes'

export function paintBarsAndOverlay(c: KlinePaint): void {
  const { ctx, props, xOfIdx, yOfPrice, volT, volH, plotL, plotW, priceT, slice, allBars, startIdx, barW, chartTheme, hoveredIndex } = c
  const subMode = props.subchartMode ?? 'vol'

    // 4. Candlesticks
    for (let i = 0; i < slice.length; i++) {
      const b = slice[i]
      const cx = xOfIdx(i)
      const isUp = b.close >= b.open
      const color = isUp ? UP : DOWN

      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 1

      // High-low wick
      const yh = Math.round(yOfPrice(b.high))
      const yl = Math.round(yOfPrice(b.low))
      ctx.beginPath()
      ctx.moveTo(Math.round(cx) + 0.5, yh)
      ctx.lineTo(Math.round(cx) + 0.5, yl)
      ctx.stroke()

      // Candle body
      const yo = yOfPrice(b.open)
      const yc = yOfPrice(b.close)
      const topY = Math.min(yo, yc)
      const botY = Math.max(yo, yc)
      const bodyH = Math.max(1.5, botY - topY)

      ctx.fillRect(
        Math.round(cx - barW / 2),
        Math.round(topY),
        Math.round(barW),
        Math.round(bodyH)
      )
    }

    // 5. Moving Average Curves
    const drawMA = (key: 'ma5' | 'ma10' | 'ma20', strokeColor: string) => {
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 1.2
      ctx.beginPath()
      let started = false

      for (let i = 0; i < slice.length; i++) {
        const val = slice[i][key]
        if (val != null && Number.isFinite(val)) {
          const x = xOfIdx(i)
          const y = yOfPrice(val)
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }
      }
      if (started) {
        ctx.stroke()
      }
    }

    drawMA('ma5', COLOR_MA5)
    drawMA('ma10', COLOR_MA10)
    drawMA('ma20', COLOR_MA20)

    // 6. Timeline Labels (e.g. 3 date stamps at bottom)
    ctx.font = FONT
    ctx.fillStyle = chartTheme.axisText
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const dateLabelsCount = Math.min(4, Math.max(2, Math.floor(plotW / 65)))
    for (let k = 0; k < dateLabelsCount; k++) {
      const idx = Math.round((k / (dateLabelsCount - 1)) * (slice.length - 1))
      const bar = slice[idx]
      if (bar) {
        const x = xOfIdx(idx)
        // Format YYYY-MM-DD -> MM-DD
        const shortDate = bar.date.length >= 10 ? bar.date.slice(5) : bar.date
        ctx.fillText(shortDate, x, volT + volH + 2)
      }
    }

    // 7. Active / Hovered Bar & Legend Display
    const hIdx = hoveredIndex()
    const activeIdx = hIdx != null && hIdx >= 0 && hIdx < slice.length ? hIdx : slice.length - 1
    const activeBar = slice[activeIdx]
    const prevActiveBar = activeIdx > 0 ? slice[activeIdx - 1] : (startIdx > 0 ? allBars[startIdx - 1] : null)

    // Render MA values on top legend
    ctx.font = FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    let lx = plotL + 2
    const ly = 7

    const [p1, p2, p3] = props.maPeriods ?? [5, 10, 20]

    if (activeBar.ma5 != null) {
      ctx.fillStyle = COLOR_MA5
      const txt = `MA${p1}:${activeBar.ma5.toFixed(2)}`
      ctx.fillText(txt, lx, ly)
      lx += ctx.measureText(txt).width + 8
    }
    if (activeBar.ma10 != null) {
      ctx.fillStyle = COLOR_MA10
      const txt = `MA${p2}:${activeBar.ma10.toFixed(2)}`
      ctx.fillText(txt, lx, ly)
      lx += ctx.measureText(txt).width + 8
    }
    if (activeBar.ma20 != null) {
      ctx.fillStyle = COLOR_MA20
      const txt = `MA${p3}:${activeBar.ma20.toFixed(2)}`
      ctx.fillText(txt, lx, ly)
    }

    // Render Subchart legend: VOL vs MACD
    ctx.font = FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let subLx = plotL + 2
    const subLy = volT + 1

    if (subMode === 'vol') {
      ctx.fillStyle = activeBar.close >= activeBar.open ? UP : DOWN
      const vTxt = `VOL:${fmtVol(activeBar.volume)}`
      ctx.fillText(vTxt, subLx, subLy)
      subLx += ctx.measureText(vTxt).width + 6

      const actGlobalIdx = startIdx + activeIdx
      if (actGlobalIdx + 1 >= p1) {
        let s1 = 0
        for (let k = actGlobalIdx - p1 + 1; k <= actGlobalIdx; k++) s1 += allBars[k].volume
        ctx.fillStyle = COLOR_MA5
        const txt1 = `MA${p1}:${fmtVol(s1 / p1)}`
        ctx.fillText(txt1, subLx, subLy)
        subLx += ctx.measureText(txt1).width + 6
      }
      if (actGlobalIdx + 1 >= p2) {
        let s2 = 0
        for (let k = actGlobalIdx - p2 + 1; k <= actGlobalIdx; k++) s2 += allBars[k].volume
        ctx.fillStyle = COLOR_MA10
        const txt2 = `MA${p2}:${fmtVol(s2 / p2)}`
        ctx.fillText(txt2, subLx, subLy)
      }
    } else {
      if (activeBar.dif != null) {
        ctx.fillStyle = '#38bdf8'
        const txt = `DIF:${activeBar.dif.toFixed(2)}`
        ctx.fillText(txt, subLx, subLy)
        subLx += ctx.measureText(txt).width + 6
      }
      if (activeBar.dea != null) {
        ctx.fillStyle = '#f59e0b'
        const txt = `DEA:${activeBar.dea.toFixed(2)}`
        ctx.fillText(txt, subLx, subLy)
        subLx += ctx.measureText(txt).width + 6
      }
      if (activeBar.macd != null) {
        ctx.fillStyle = activeBar.macd >= 0 ? UP : DOWN
        const txt = `MACD:${activeBar.macd.toFixed(2)}`
        ctx.fillText(txt, subLx, subLy)
        subLx += ctx.measureText(txt).width + 6
      }

      if (activeBar.dif != null && activeBar.dea != null) {
        const diag = diagnoseMacd(
          activeBar.dif,
          activeBar.dea,
          prevActiveBar?.dif,
          prevActiveBar?.dea
        )
        if (diag.text) {
          ctx.fillStyle = diag.color
          ctx.fillText(diag.text, subLx, subLy)
        }
      }
    }

    // 8. Crosshair Cursor (when hovering)
    if (hIdx != null && hIdx >= 0 && hIdx < slice.length) {
      const hBar = slice[hIdx]
      const hx = Math.round(xOfIdx(hIdx)) + 0.5
      const hy = Math.round(yOfPrice(hBar.close)) + 0.5

      ctx.save()
      ctx.setLineDash([2, 2])
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
      ctx.lineWidth = 1

      // Vertical line across whole chart
      ctx.beginPath()
      ctx.moveTo(hx, priceT)
      ctx.lineTo(hx, volT + volH)
      ctx.stroke()

      // Horizontal line through close price
      ctx.beginPath()
      ctx.moveTo(plotL, hy)
      ctx.lineTo(plotL + plotW, hy)
      ctx.stroke()
      ctx.restore()

      // Right axis price badge
      ctx.fillStyle = hBar.close >= hBar.open ? UP : DOWN
      const priceBadge = fmtPrice(hBar.close)
      const badgeW = ctx.measureText(priceBadge).width + 6
      ctx.fillRect(plotL + plotW + 2, hy - 6, badgeW, 12)
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(priceBadge, plotL + plotW + 5, hy)

      // Bottom date badge
      ctx.fillStyle = 'rgba(30, 41, 59, 0.9)'
      ctx.fillRect(hx - 22, volT + volH + 1, 44, 12)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.strokeRect(hx - 22, volT + volH + 1, 44, 12)
      ctx.fillStyle = '#f3f4f6'
      ctx.textAlign = 'center'
      ctx.fillText(hBar.date.slice(5), hx, volT + volH + 7)
    }
}
