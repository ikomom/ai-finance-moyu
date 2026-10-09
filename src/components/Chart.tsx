import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'

import { drawTrend, slotOf, type DrawOptions } from '../chart'
import type { TrendPoint } from '../types'

export interface ChartProps extends DrawOptions {
  onHover?: (point: TrendPoint | null) => void
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

  createEffect(() => {
    const slot = hoverSlot()
    if (slot == null || !props.trend?.points?.length) {
      props.onHover?.(null)
      return
    }
    const points = props.trend.points
    let closest = points[0]
    let minDiff = 999
    for (const p of points) {
      const diff = Math.abs(slotOf(p.time) - slot)
      if (diff < minDiff) {
        minDiff = diff
        closest = p
      }
    }
    props.onHover?.(closest)
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
  }

  const handleMouseLeave = () => {
    setHoverSlot(null)
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
