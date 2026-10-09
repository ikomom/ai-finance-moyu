import { createEffect, onCleanup, onMount } from 'solid-js'

import { drawSparkline } from '../chart'
import type { Trend } from '../types'

interface Props {
  trend?: Trend
  preClose: number
  lastPrice?: number
}

export function Sparkline(props: Props) {
  let canvas!: HTMLCanvasElement
  let wrap!: HTMLDivElement
  let lastBox = ''

  const draw = () => {
    if (!canvas) return
    drawSparkline(canvas, props.trend, props.preClose, props.lastPrice)
  }

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

  createEffect(draw)

  return (
    <div ref={wrap} class="sparkline-wrap">
      <canvas ref={canvas} class="sparkline" />
    </div>
  )
}
