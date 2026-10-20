import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'

import {
  type KLineBar,
  type KLineData,
  type PriceLine,
  type Quote,
} from '../types'
import { computeKLineMacd, computeKLineMovingAverages } from '../utils/indicators'
import { drawKline } from './klineDraw'


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
    if (!canvasRef) return
    drawKline({
      canvas: canvasRef,
      props: props,
      bars: effectiveBars(),
      quote: props.quote ?? undefined,
      hoveredIndex: hoveredIndex(),
      visibleCount: visibleCount(),
      offsetRight: offsetRight(),
    })
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
