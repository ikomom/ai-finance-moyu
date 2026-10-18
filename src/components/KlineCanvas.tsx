import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'

import {
  DOWN,
  fmtPrice,
  fmtVol,
  UP,
  type KLineBar,
  type KLineData,
  type PriceLine,
  type Quote,
} from '../types'
import { computeKLineMacd, computeKLineMovingAverages } from '../utils/indicators'

import {
  AXIS_TEXT,
  COLOR_MA10,
  COLOR_MA20,
  COLOR_MA5,
  COST_LINE,
  diagnoseMacd,
  FONT,
  GRID,
  setupCanvasDpi,
} from '../chart'

export interface KlineCanvasProps {
  kline?: KLineData | null
  quote?: Quote | null
  costPrice?: number | null
  priceLines?: PriceLine[]
  compact?: boolean
  subchartMode?: 'vol' | 'macd'
  maPeriods?: [number, number, number]
  macdParams?: [number, number, number]
  onHoverBar?: (
    bar: KLineBar | null,
    extra?: {
      ma5?: number | null
      ma10?: number | null
      ma20?: number | null
      dif?: number | null
      dea?: number | null
      macd?: number | null
      chgPct?: number | null
    } | null
  ) => void
}

export function KlineCanvas(props: KlineCanvasProps) {
  let canvasRef!: HTMLCanvasElement
  let wrapRef!: HTMLDivElement

  // View window state: how many bars to show and right offset (0 = latest)
  const [visibleCount, setVisibleCount] = createSignal(45)
  const [offsetRight, setOffsetRight] = createSignal(0)
  const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null)
  const [isDragging, setIsDragging] = createSignal(false)
  let dragStartX = 0
  let dragStartOffset = 0

  // Combine historical bars with intraday dynamic quote for the latest trading day
  const effectiveBars = (): KLineBar[] => {
    const raw = props.kline?.bars ?? []
    if (raw.length === 0) return []

    const q = props.quote
    if (!q || q.price <= 0 || !q.date) {
      return raw
    }

    const qDate = q.date.includes('-')
      ? q.date
      : `${q.date.slice(0, 4)}-${q.date.slice(4, 6)}-${q.date.slice(6, 8)}`

    const last = raw[raw.length - 1]
    const list = [...raw]

    if (last.date === qDate) {
      // Update today's bar dynamically from live quote
      list[list.length - 1] = {
        ...last,
        open: q.open > 0 ? q.open : last.open,
        close: q.price,
        high: Math.max(last.high, q.high > 0 ? q.high : q.price),
        low: Math.min(last.low, q.low > 0 ? q.low : q.price),
        volume: q.volume > 0 ? q.volume : last.volume,
      }
    } else if (qDate > last.date) {
      // Append today's dynamic bar if not present yet
      list.push({
        date: qDate,
        open: q.open > 0 ? q.open : q.price,
        close: q.price,
        high: q.high > 0 ? q.high : q.price,
        low: q.low > 0 ? q.low : q.price,
        volume: q.volume,
        ma5: null,
        ma10: null,
        ma20: null,
        dif: null,
        dea: null,
        macd: null,
      })
    }

    // Recalculate moving averages and MACD using configured periods
    computeKLineMovingAverages(list, props.maPeriods)
    computeKLineMacd(list, props.macdParams)

    return list
  }

  const draw = () => {
    const canvas = canvasRef
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (w < 10 || h < 10) return

    const dpi = setupCanvasDpi(canvas, w, h)
    if (!dpi) return
    const { ctx } = dpi

    const allBars = effectiveBars()
    if (allBars.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)'
      ctx.font = FONT
      ctx.textAlign = 'center'
      ctx.fillText('日K线加载中...', w / 2, h / 2)
      return
    }

    // Geometry layout
    const padL = props.compact ? 4 : 6
    const padR = props.compact ? 36 : 42
    const legendH = 14
    const bottomAxisH = 13
    const plotL = padL
    const plotW = Math.max(10, w - padL - padR)

    const contentH = Math.max(20, h - legendH - bottomAxisH)
    const priceH = Math.max(20, Math.round(contentH * 0.58))
    const volH = Math.max(12, contentH - priceH - 3)

    const priceT = legendH
    const volT = priceT + priceH + 3
    const subPlotPad = 10
    const subPlotH = Math.max(6, volH - subPlotPad)

    // Window slice
    const total = allBars.length
    const count = Math.min(total, Math.max(15, visibleCount()))
    const maxOffset = Math.max(0, total - count)
    const off = Math.min(maxOffset, Math.max(0, offsetRight()))

    const startIdx = Math.max(0, total - off - count)
    const endIdx = Math.min(total, startIdx + count)
    const slice = allBars.slice(startIdx, endIdx)

    if (slice.length === 0) {
      return
    }

    // Price scaling
    let minP = Infinity
    let maxP = -Infinity
    let maxV = 0

    for (const b of slice) {
      if (b.low < minP) minP = b.low
      if (b.high > maxP) maxP = b.high
      if (b.ma5 != null) {
        if (b.ma5 < minP) minP = b.ma5
        if (b.ma5 > maxP) maxP = b.ma5
      }
      if (b.ma10 != null) {
        if (b.ma10 < minP) minP = b.ma10
        if (b.ma10 > maxP) maxP = b.ma10
      }
      if (b.ma20 != null) {
        if (b.ma20 < minP) minP = b.ma20
        if (b.ma20 > maxP) maxP = b.ma20
      }
      if (b.volume > maxV) maxV = b.volume
    }

    // Include cost line if configured and reasonably close
    if (props.costPrice && props.costPrice > 0) {
      const cp = props.costPrice
      if (cp >= minP * 0.7 && cp <= maxP * 1.3) {
        if (cp < minP) minP = cp
        if (cp > maxP) maxP = cp
      }
    }

    if (!Number.isFinite(minP) || !Number.isFinite(maxP) || minP >= maxP) {
      minP = minP === Infinity ? 10 : minP * 0.95
      maxP = maxP === -Infinity ? 10.5 : maxP * 1.05
    }

    // Margin padding 4% top and bottom
    const pMargin = (maxP - minP) * 0.04
    minP -= pMargin
    maxP += pMargin
    const pRange = maxP - minP

    const yOfPrice = (p: number) => priceT + priceH - ((p - minP) / pRange) * priceH
    const yOfVol = (v: number) => (maxV > 0 ? volT + volH - (v / maxV) * subPlotH : volT + volH)

    const slotW = plotW / slice.length
    const xOfIdx = (i: number) => plotL + i * slotW + slotW / 2

    // 1. Grid & Price Axis
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    ctx.beginPath()

    // 3 horizontal price grid lines
    const gridRows = 3
    for (let r = 0; r <= gridRows; r++) {
      const y = Math.round(priceT + (priceH / gridRows) * r) + 0.5
      ctx.moveTo(plotL, y)
      ctx.lineTo(plotL + plotW, y)
    }
    // Volume top divider
    ctx.moveTo(plotL, Math.round(volT) - 0.5)
    ctx.lineTo(plotL + plotW, Math.round(volT) - 0.5)
    ctx.stroke()

    // Price labels on the right
    ctx.font = FONT
    ctx.fillStyle = AXIS_TEXT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(fmtPrice(maxP), plotL + plotW + 4, priceT + 5)
    ctx.fillText(fmtPrice((maxP + minP) / 2), plotL + plotW + 4, priceT + priceH / 2)
    ctx.fillText(fmtPrice(minP), plotL + plotW + 4, priceT + priceH - 4)

    // Volume label on the right
    if (maxV > 0) {
      ctx.fillText(fmtVol(maxV), plotL + plotW + 4, volT + 5)
    }

    // 2. Cost Price Line & Price Lines
    if (props.costPrice && props.costPrice > 0) {
      const cp = props.costPrice
      if (cp >= minP && cp <= maxP) {
        const cy = Math.round(yOfPrice(cp)) + 0.5
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = COST_LINE
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(plotL, cy)
        ctx.lineTo(plotL + plotW, cy)
        ctx.stroke()

        ctx.fillStyle = COST_LINE
        ctx.fillText(`成本 ${fmtPrice(cp)}`, plotL + plotW + 4, cy)
        ctx.restore()
      }
    }

    if (props.priceLines) {
      for (const pl of props.priceLines) {
        if (pl.price >= minP && pl.price <= maxP) {
          const py = Math.round(yOfPrice(pl.price)) + 0.5
          ctx.save()
          ctx.setLineDash([2, 2])
          ctx.strokeStyle = pl.direction === 'above' ? 'rgba(239, 68, 68, 0.65)' : 'rgba(34, 197, 94, 0.65)'
          ctx.beginPath()
          ctx.moveTo(plotL, py)
          ctx.lineTo(plotL + plotW, py)
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    // 3. Subchart (VOL vs MACD switchable)
    const subMode = props.subchartMode ?? 'vol'
    const barW = Math.max(1.5, Math.min(18, slotW * 0.72))

    if (subMode === 'vol') {
      // 3a. Pure Volume bars (full contrast & crisp)
      for (let i = 0; i < slice.length; i++) {
        const b = slice[i]
        const cx = xOfIdx(i)
        const vy = yOfVol(b.volume)
        const vh = Math.max(1, volT + volH - vy)
        const isUp = b.close >= b.open

        ctx.fillStyle = isUp ? 'rgba(239, 68, 68, 0.85)' : 'rgba(34, 197, 94, 0.85)'
        ctx.fillRect(Math.round(cx - barW / 2), Math.round(vy), Math.round(barW), Math.round(vh))
      }

      // 3b. VOL MA5 & VOL MA10
      const drawVolMA = (period: number, color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.0
        ctx.beginPath()
        let started = false
        for (let i = 0; i < slice.length; i++) {
          const globalIdx = startIdx + i
          if (globalIdx + 1 >= period) {
            let sum = 0
            for (let k = globalIdx + 1 - period; k <= globalIdx; k++) {
              sum += allBars[k].volume
            }
            const avg = sum / period
            const x = xOfIdx(i)
            const y = yOfVol(avg)
            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else {
              ctx.lineTo(x, y)
            }
          }
        }
        if (started) ctx.stroke()
      }
      const [vp1, vp2] = props.maPeriods ?? [5, 10, 20]
      drawVolMA(vp1, COLOR_MA5)
      drawVolMA(vp2, COLOR_MA10)
    } else {
      // 3c. Pure MACD Subchart
      let minM = 0
      let maxM = 0
      for (const b of slice) {
        if (b.dif != null) {
          if (b.dif < minM) minM = b.dif
          if (b.dif > maxM) maxM = b.dif
        }
        if (b.dea != null) {
          if (b.dea < minM) minM = b.dea
          if (b.dea > maxM) maxM = b.dea
        }
        if (b.macd != null) {
          if (b.macd < minM) minM = b.macd
          if (b.macd > maxM) maxM = b.macd
        }
      }
      if (minM === 0 && maxM === 0) {
        minM = -0.05
        maxM = 0.05
      }
      const spanM = Math.max(0.0001, (maxM - minM) * 1.15)
      const midM = (maxM + minM) / 2
      const macdMin = midM - spanM / 2
      const macdMax = midM + spanM / 2
      const yOfMacd = (v: number) => volT + volH - ((v - macdMin) / (macdMax - macdMin)) * subPlotH
      const zeroY = Math.round(yOfMacd(0)) + 0.5

      // Zero-axis dashed baseline
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(plotL, zeroY)
      ctx.lineTo(plotL + plotW, zeroY)
      ctx.stroke()
      ctx.restore()

      // MACD Histogram Bars
      const histW = Math.max(1.5, Math.min(10, barW * 0.65))
      for (let i = 0; i < slice.length; i++) {
        const b = slice[i]
        const m = b.macd ?? 0
        const cx = xOfIdx(i)
        const my = yOfMacd(m)
        const barTop = Math.min(zeroY, my)
        const barHeight = Math.max(1, Math.abs(my - zeroY))
        const isMUp = m >= 0

        ctx.fillStyle = isMUp ? 'rgba(239, 68, 68, 0.88)' : 'rgba(34, 197, 94, 0.88)'
        ctx.fillRect(Math.round(cx - histW / 2), Math.round(barTop), Math.round(histW), Math.round(barHeight))
      }

      // DIF (#38bdf8) and DEA (#f59e0b) curves
      const drawMacdLine = (key: 'dif' | 'dea', color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.1
        ctx.beginPath()
        let started = false
        for (let i = 0; i < slice.length; i++) {
          const val = slice[i][key]
          if (val != null && Number.isFinite(val)) {
            const x = xOfIdx(i)
            const y = yOfMacd(val)
            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else {
              ctx.lineTo(x, y)
            }
          }
        }
        if (started) ctx.stroke()
      }
      drawMacdLine('dif', '#38bdf8')
      drawMacdLine('dea', '#f59e0b')
    }

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
    ctx.fillStyle = AXIS_TEXT
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

  // Mouse / Wheel Event Handlers
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const step = e.deltaY > 0 ? 4 : -4
    const newCount = Math.min(160, Math.max(20, visibleCount() + step))
    setVisibleCount(newCount)
  }

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    dragStartX = e.clientX
    dragStartOffset = offsetRight()
  }

  const handleMouseMove = (e: MouseEvent) => {
    const canvas = canvasRef
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const relX = e.clientX - rect.left

    const padL = props.compact ? 4 : 6
    const padR = props.compact ? 36 : 42
    const plotW = Math.max(10, rect.width - padL - padR)

    if (isDragging()) {
      const dx = e.clientX - dragStartX
      const allBars = effectiveBars()
      const total = allBars.length
      const count = visibleCount()
      const maxOffset = Math.max(0, total - count)

      // Convert pixel drag to bar offset shift
      const barShift = Math.round((dx / (plotW / count)) * 0.85)
      const newOff = Math.min(maxOffset, Math.max(0, dragStartOffset + barShift))
      setOffsetRight(newOff)
      return
    }

    // Hover detection
    const allBars = effectiveBars()
    const total = allBars.length
    const count = Math.min(total, visibleCount())
    const maxOffset = Math.max(0, total - count)
    const off = Math.min(maxOffset, Math.max(0, offsetRight()))
    const startIdx = Math.max(0, total - off - count)
    const endIdx = Math.min(total, startIdx + count)
    const slice = allBars.slice(startIdx, endIdx)

    if (slice.length > 0 && relX >= padL && relX <= padL + plotW) {
      const slotW = plotW / slice.length
      const idx = Math.min(slice.length - 1, Math.max(0, Math.floor((relX - padL) / slotW)))
      setHoveredIndex(idx)

      const bar = slice[idx]
      const prevBar = idx > 0 ? slice[idx - 1] : (startIdx > 0 ? allBars[startIdx - 1] : null)
      const preClose = prevBar ? prevBar.close : bar.open
      const chgPct = preClose > 0 ? ((bar.close - preClose) / preClose) * 100 : 0

      if (props.onHoverBar) {
        props.onHoverBar(bar, {
          ma5: bar.ma5,
          ma10: bar.ma10,
          ma20: bar.ma20,
          dif: bar.dif,
          dea: bar.dea,
          macd: bar.macd,
          chgPct,
        })
      }
    } else {
      setHoveredIndex(null)
      if (props.onHoverBar) props.onHoverBar(null, null)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setHoveredIndex(null)
    if (props.onHoverBar) props.onHoverBar(null, null)
  }

  // Reactive redraw
  createEffect(() => {
    props.kline
    props.quote?.price
    props.quote?.volume
    props.costPrice
    props.subchartMode
    visibleCount()
    offsetRight()
    hoveredIndex()
    draw()
  })

  onMount(() => {
    draw()
    if (!wrapRef) return
    const ro = new ResizeObserver(() => draw())
    ro.observe(wrapRef)
    onCleanup(() => ro.disconnect())
  })

  return (
    <div
      ref={wrapRef}
      class="chart-wrap"
      style={{ cursor: isDragging() ? 'grabbing' : 'crosshair', 'user-select': 'none' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} class="chart" />
    </div>
  )
}
