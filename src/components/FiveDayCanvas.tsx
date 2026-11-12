//! FiveDayCanvas.tsx: 5-Day Intraday Trend Canvas Component.
//!
//! Handles DPR scaling, mouse crosshair tracking, drill-down on day click,
//! volume and trade inspection popup. Under 250 lines (AGENTS.md §11).

import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { drawFiveDayTrend, type FiveDayHoverInfo } from '../chart/renderers/fiveDayRenderer'
import type { DayTrend, MultiDayTrend, TradeRecord } from '../types'

export interface FiveDayCanvasProps {
  multiTrend: MultiDayTrend
  costPrice?: number | null
  trades?: TradeRecord[]
  onSelectDay?: (day: DayTrend) => void
  onHover?: (info: FiveDayHoverInfo | null) => void
}

export function FiveDayCanvas(props: FiveDayCanvasProps) {
  let canvas!: HTMLCanvasElement
  let wrap!: HTMLDivElement
  let lastBox = ''

  const [hoverDayIndex, setHoverDayIndex] = createSignal<number | null>(null)
  const [hoverSlot, setHoverSlot] = createSignal<number | null>(null)

  const draw = () => {
    if (!canvas || !props.multiTrend) return
    const info = drawFiveDayTrend(canvas, {
      multiTrend: props.multiTrend,
      costPrice: props.costPrice,
      trades: props.trades,
      hoverDayIndex: hoverDayIndex(),
      hoverSlot: hoverSlot(),
    })
    props.onHover?.(info)
  }

  const resize = () => {
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (w <= 0 || h <= 0) return

    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    draw()
  }

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      const key = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : ''
      if (key === lastBox) return
      lastBox = key
      resize()
    })
    observer.observe(wrap)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    if (props.multiTrend) {
      draw()
    }
  })

  const handlePointerMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const w = rect.width
    const days = props.multiTrend.days
    if (!days || days.length === 0 || w <= 0) return

    const N = days.length
    const dayWidth = w / N
    const dIdx = Math.max(0, Math.min(N - 1, Math.floor(x / dayWidth)))
    const inDayX = x - dIdx * dayWidth
    const slot = Math.max(0, Math.min(240, Math.round((inDayX / dayWidth) * 240)))

    setHoverDayIndex(dIdx)
    setHoverSlot(slot)
    draw()
  }

  const handlePointerLeave = () => {
    setHoverDayIndex(null)
    setHoverSlot(null)
    draw()
  }

  const triggerDrillDown = (clientX: number) => {
    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const w = rect.width
    const days = props.multiTrend.days
    if (!days || days.length === 0 || w <= 0) return

    const N = days.length
    const dayWidth = w / N
    const dIdx = Math.max(0, Math.min(N - 1, Math.floor(x / dayWidth)))
    const targetDay = days[dIdx]
    if (targetDay && props.onSelectDay) {
      props.onSelectDay(targetDay)
    }
  }

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    triggerDrillDown(e.clientX)
  }

  const handleDblClick = (e: MouseEvent) => {
    e.stopPropagation()
    triggerDrillDown(e.clientX)
  }

  return (
    <div
      ref={wrap}
      class="five-day-canvas-wrap"
      data-tauri-drag-region="none"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        'user-select': 'none',
        cursor: 'crosshair',
      }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onDblClick={handleDblClick}
    >
      <canvas ref={canvas} style={{ display: 'block' }} />
    </div>
  )
}
