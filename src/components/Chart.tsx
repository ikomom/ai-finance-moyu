import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { computeMinuteMacd, drawTrend, slotOf, type DrawOptions } from '../chart'
import type { TrendPoint } from '../types'

export interface ChartProps extends DrawOptions {
  onHover?: (
    point: TrendPoint | null,
    extra?: { minVol: number; dif?: number; dea?: number; macd?: number } | null
  ) => void
}

export function Chart(props: ChartProps) {
  let canvas!: HTMLCanvasElement
  let wrap!: HTMLDivElement
  let lastBox = ''
  const [hoverSlot, setHoverSlot] = createSignal<number | null>(null)

  const draw = () =>
    drawTrend(canvas, {
      trend: props.trend,
      preClose: props.preClose,
      costPrice: props.costPrice,
      priceLines: props.priceLines,
      lastPrice: props.lastPrice,
      compact: props.compact,
      hoverSlot: hoverSlot(),
      orbHigh: props.orbHigh,
      orbLow: props.orbLow,
      subchartMode: props.subchartMode,
      macdParams: props.macdParams,
      isGlobal: props.isGlobal,
    })

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      const key = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : ''
      if (key === lastBox) return
      lastBox = key
      requestAnimationFrame(draw)
    })
    observer.observe(wrap)
    onCleanup(() => observer.disconnect())
  })

  // Tracked: reading the props inside `draw` is what subscribes this effect.
  createEffect(draw)

  const findClosestPoint = (
    slot: number | null
  ): { point: TrendPoint; minVol: number; dif?: number; dea?: number; macd?: number } | null => {
    if (slot == null || !props.trend?.points?.length) return null
    const points = props.trend.points
    let closestIdx = 0
    if (props.isGlobal) {
      closestIdx = Math.min(
        points.length - 1,
        Math.max(0, Math.round((slot / 240) * (points.length - 1)))
      )
    } else {
      let minDiff = 999
      for (let i = 0; i < points.length; i++) {
        const diff = Math.abs(slotOf(points[i].time) - slot)
        if (diff < minDiff) {
          minDiff = diff
          closestIdx = i
        }
      }
    }
    const pt = points[closestIdx]
    const prev = closestIdx > 0 ? points[closestIdx - 1] : null
    const minVol = prev ? Math.max(0, pt.cumVolume - prev.cumVolume) : pt.cumVolume
    const macds = computeMinuteMacd(points, props.macdParams)
    const m = macds[closestIdx]
    return { point: pt, minVol, dif: m?.dif, dea: m?.dea, macd: m?.macd }
  }

  createEffect(() => {
    // Reset hover when trend / stock changes
    props.trend
    setHoverSlot(null)
    props.onHover?.(null, null)
  })

  const handleMouseMove = (e: MouseEvent) => {
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const padL = props.compact ? 38 : 44
    const padR = props.compact ? 34 : 40
    const plotW = Math.max(1, rect.width - padL - padR)
    const relX = e.clientX - rect.left - padL
    const slot = Math.min(240, Math.max(0, Math.round((relX / plotW) * 240)))
    setHoverSlot(slot)
    const found = findClosestPoint(slot)
    props.onHover?.(found?.point ?? null, found ? { minVol: found.minVol } : null)
  }

  const handleMouseLeave = () => {
    setHoverSlot(null)
    props.onHover?.(null, null)
  }

  return (
    <div
      ref={wrap}
      class="chart-wrap"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvas} class="chart" />
    </div>
  )
}
