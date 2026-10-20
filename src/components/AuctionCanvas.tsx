import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { AuctionPoint } from '../types'
import { AUCTION_SLOTS, slotOfAuctionTime } from '../chart'
import { drawAuctionChart } from './auctionDraw'
import type { AuctionCanvasProps } from './auctionAxis'

export type { AuctionCanvasProps }

/**
 * Call-auction dual-bar canvas (撮合量 / 未匹配委托).
 *
 * Painting lives in `auctionDraw.ts`; this component only owns the element
 * refs, the hover signal and the resize observer.
 */
export function AuctionCanvas(props: AuctionCanvasProps) {
  let canvas!: HTMLCanvasElement
  let wrap!: HTMLDivElement
  let lastBox = ''
  const [hoverSlot, setHoverSlot] = createSignal<number | null>(null)

  const draw = () => drawAuctionChart(canvas, props, hoverSlot)

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

  const handleMouseMove = (e: MouseEvent) => {
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const padL = props.compact ? 40 : 44
    const padR = props.compact ? 36 : 40
    const plotW = Math.max(1, rect.width - padL - padR)
    const relX = e.clientX - rect.left - padL
    const slot = Math.min(AUCTION_SLOTS, Math.max(0, Math.round((relX / plotW) * AUCTION_SLOTS)))
    setHoverSlot(slot)

    const points = props.auction?.points ?? []
    let closest: AuctionPoint | null = null
    let minDiff = 999
    for (const p of points) {
      const diff = Math.abs(slotOfAuctionTime(p.time) - slot)
      if (diff < minDiff) {
        minDiff = diff
        closest = p
      }
    }
    props.onHover?.(closest)
  }

  const handleMouseLeave = () => {
    setHoverSlot(null)
    props.onHover?.(null)
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
