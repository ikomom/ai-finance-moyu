import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { AuctionData, AuctionPoint } from '../types'
import { DOWN, UP } from '../types'

export interface AuctionCanvasProps {
  auction?: AuctionData | null
  preClose: number
  compact?: boolean
  onHover?: (point: AuctionPoint | null) => void
}

import {
  AUCTION_SLOTS,
  AXIS_TEXT,
  DIVIDER_LINE,
  FONT,
  GRID,
  PRE_CLOSE_LINE,
  setupCanvasDpi,
  slotOfAuctionTime,
} from '../chart'

function fmtVol(vol: number): string {
  if (vol >= 10000) return `${(vol / 10000).toFixed(1)}万`
  return `${Math.round(vol)}`
}

export function AuctionCanvas(props: AuctionCanvasProps) {
  let canvas!: HTMLCanvasElement
  let wrap!: HTMLDivElement
  let lastBox = ''
  const [hoverSlot, setHoverSlot] = createSignal<number | null>(null)

  const draw = () => {
    if (!canvas) return
    const dpi = setupCanvasDpi(canvas)
    if (!dpi) return
    const { ctx, cssW, cssH } = dpi
    ctx.font = FONT
    ctx.textBaseline = 'middle'

    const compact = props.compact ?? false
    const pad = compact
      ? { left: 40, right: 36, top: 14, bottom: 12 }
      : { left: 44, right: 40, top: 16, bottom: 12 }

    const plotL = pad.left
    const plotT = pad.top
    const plotW = Math.max(1, cssW - pad.left - pad.right)
    const fullH = Math.max(1, cssH - pad.top - pad.bottom)

    // Split into Price section (top 68%) and Volume section (bottom 28%)
    const priceH = Math.round(fullH * 0.68)
    const volT = plotT + priceH + 4
    const volH = Math.max(8, fullH - priceH - 4)

    const points = props.auction?.points ?? []
    const preClose = props.preClose || (points[0]?.price ?? 10.0)

    // Calculate symmetric price scale around preClose (minimum 1.0% spread)
    let maxDev = preClose * 0.01
    for (const p of points) {
      if (p.price > 0) {
        maxDev = Math.max(maxDev, Math.abs(p.price - preClose))
      }
    }
    const pointTotalVol = (p: AuctionPoint) => (p.matchedVolume ?? p.volume) + (p.unmatchedVolume ?? 0)
    const maxVol = Math.max(10, ...points.map(pointTotalVol))

    const yOfPrice = (price: number) => {
      const norm = (price - preClose) / (maxDev || 1)
      return plotT + priceH / 2 - (norm * (priceH / 2))
    }

    const xOfSlot = (slot: number) => {
      return plotL + (slot / AUCTION_SLOTS) * plotW
    }

    const dividerX = xOfSlot(5) // 09:20 demarcation line

    // 1. Phase Zone Backgrounds (09:15-09:20 vs 09:20-09:25)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.035)'
    ctx.fillRect(plotL, plotT, dividerX - plotL, priceH)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.035)'
    ctx.fillRect(dividerX, plotT, plotL + plotW - dividerX, priceH)

    // 2. Grid & Borders
    ctx.strokeStyle = GRID
    ctx.lineWidth = 1
    ctx.strokeRect(plotL, plotT, plotW, priceH)
    ctx.strokeRect(plotL, volT, plotW, volH)

    // 3. Pre-close dashed line (0% deviation, dead center of price section)
    const preCloseY = plotT + priceH / 2
    ctx.save()
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = PRE_CLOSE_LINE
    ctx.beginPath()
    ctx.moveTo(plotL, preCloseY)
    ctx.lineTo(plotL + plotW, preCloseY)
    ctx.stroke()
    ctx.restore()

    // 4. 09:20 Demarcation Line (slot 5 out of 10)
    ctx.save()
    ctx.setLineDash([2, 2])
    ctx.strokeStyle = DIVIDER_LINE
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(dividerX, plotT)
    ctx.lineTo(dividerX, volT + volH)
    ctx.stroke()
    ctx.restore()

    // 5. Volume histogram in bottom section: Dual-layer stacked bar (matched + unmatched)
    for (const p of points) {
      const slot = slotOfAuctionTime(p.time)
      const x = xOfSlot(slot)
      const matchedVol = p.matchedVolume ?? p.volume
      const unmatchedVol = p.unmatchedVolume ?? 0
      const side = p.unmatchedSide ?? 'none'

      const matchedH = maxVol > 0 ? (matchedVol / maxVol) * volH : 0
      const unmatchedH = maxVol > 0 ? (unmatchedVol / maxVol) * volH : 0
      const barW = 5
      const barX = x - barW / 2

      // Bottom solid bar: matched volume
      if (matchedH > 0) {
        const matchedY = volT + volH - matchedH
        const matchedColor = p.price >= preClose ? UP : DOWN
        ctx.fillStyle = matchedColor
        ctx.globalAlpha = 0.85
        ctx.fillRect(barX, matchedY, barW, Math.max(1, matchedH))
      }

      // Top extension bar: unmatched residual order volume
      if (unmatchedH > 0) {
        const unmatchedY = volT + volH - matchedH - unmatchedH
        const sideColor = side === 'buy' ? UP : side === 'sell' ? DOWN : 'rgba(255, 255, 255, 0.45)'

        // Semi-transparent hollow body
        ctx.fillStyle = sideColor
        ctx.globalAlpha = 0.28
        ctx.fillRect(barX, unmatchedY, barW, Math.max(1, unmatchedH))

        // Crisp 1px outline
        ctx.strokeStyle = sideColor
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.85
        ctx.strokeRect(barX + 0.5, unmatchedY + 0.5, barW - 1, Math.max(1, unmatchedH - 1))
      }
      ctx.globalAlpha = 1.0
    }

    if (maxVol > 10) {
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.fillText(`${fmtVol(maxVol)}手`, plotL + 3, volT + 6)
    }

    // 7. Price trajectory and points
    if (points.length > 0) {
      const firstP = points[0]
      const firstSlot = slotOfAuctionTime(firstP.time)

      // If the app was launched mid-auction (first point > 09:15),
      // draw a smooth dashed anchor from 09:15 preClose baseline to the first sample
      if (firstSlot > 0) {
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
        ctx.beginPath()
        ctx.moveTo(plotL, preCloseY)
        ctx.lineTo(xOfSlot(firstSlot), yOfPrice(firstP.price))
        ctx.stroke()
        ctx.restore()
      }

      // Draw continuous price curve through all sampled points
      if (points.length > 1) {
        const lastP = points[points.length - 1]
        const lineColor = lastP.price >= preClose ? UP : DOWN

        // Shaded fill under price curve to preClose baseline
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(xOfSlot(firstSlot), preCloseY)
        for (const p of points) {
          const s = slotOfAuctionTime(p.time)
          ctx.lineTo(xOfSlot(s), yOfPrice(p.price))
        }
        ctx.lineTo(xOfSlot(slotOfAuctionTime(lastP.time)), preCloseY)
        ctx.closePath()
        const grad = ctx.createLinearGradient(0, plotT, 0, plotT + priceH)
        if (lastP.price >= preClose) {
          grad.addColorStop(0, 'rgba(239, 68, 68, 0.16)')
          grad.addColorStop(1, 'rgba(239, 68, 68, 0.0)')
        } else {
          grad.addColorStop(0, 'rgba(34, 197, 94, 0.0)')
          grad.addColorStop(1, 'rgba(34, 197, 94, 0.16)')
        }
        ctx.fillStyle = grad
        ctx.fill()
        ctx.restore()

        // Solid price line
        ctx.beginPath()
        let first = true
        for (const p of points) {
          const s = slotOfAuctionTime(p.time)
          const x = xOfSlot(s)
          const y = yOfPrice(p.price)
          if (first) {
            ctx.moveTo(x, y)
            first = false
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.strokeStyle = lineColor
        ctx.lineWidth = 1.8
        ctx.stroke()
      }

      // Dots on all sample points
      for (const p of points) {
        const s = slotOfAuctionTime(p.time)
        const x = xOfSlot(s)
        const y = yOfPrice(p.price)
        ctx.fillStyle = p.price >= preClose ? UP : DOWN
        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // Active pulsing ring on latest sample point
      const lastP = points[points.length - 1]
      const lastSlot = slotOfAuctionTime(lastP.time)
      const lastX = xOfSlot(lastSlot)
      const lastY = yOfPrice(lastP.price)
      const activeColor = lastP.price >= preClose ? UP : DOWN

      ctx.save()
      ctx.strokeStyle = activeColor
      ctx.globalAlpha = 0.45
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(lastX, lastY, 5.0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      // Callout tag if only 1 point or when hovered
      if (points.length === 1) {
        ctx.fillStyle = activeColor
        ctx.textAlign = lastSlot >= 8 ? 'right' : 'left'
        const tagX = lastSlot >= 8 ? lastX - 8 : lastX + 8
        const pct = preClose > 0 ? ((lastP.price - preClose) / preClose) * 100 : 0
        const sign = pct >= 0 ? '+' : ''
        ctx.fillText(`撮合 ¥${lastP.price.toFixed(2)} (${sign}${pct.toFixed(2)}%)`, tagX, lastY - 6)
      }
    }

    // 8. Hover Crosshair & Interactive Probing
    if (hoverSlot() != null) {
      const hs = hoverSlot()!
      const hx = xOfSlot(hs)
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(hx, plotT)
      ctx.lineTo(hx, volT + volH)
      ctx.stroke()
      ctx.restore()

      // Highlight the hovered point on the price curve
      const hp = points.find((p) => slotOfAuctionTime(p.time) === hs)
      if (hp) {
        const hy = yOfPrice(hp.price)
        const pColor = hp.price >= preClose ? UP : DOWN
        ctx.save()
        ctx.fillStyle = pColor
        ctx.beginPath()
        ctx.arc(hx, hy, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(hx, hy, 4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }

    // 9. Scales & Axis Labels
    ctx.fillStyle = AXIS_TEXT
    ctx.textAlign = 'right'
    // Left price ticks
    if (priceH >= 40) {
      ctx.fillText((preClose + maxDev).toFixed(2), plotL - 3, plotT + 4)
      ctx.fillText(preClose.toFixed(2), plotL - 3, preCloseY)
      ctx.fillText((preClose - maxDev).toFixed(2), plotL - 3, plotT + priceH - 4)
    } else {
      ctx.fillText(preClose.toFixed(2), plotL - 3, preCloseY)
    }

    // Right percent ticks
    const pctSpread = (maxDev / preClose) * 100
    ctx.textAlign = 'left'
    if (priceH >= 40) {
      ctx.fillText(`+${pctSpread.toFixed(1)}%`, plotL + plotW + 3, plotT + 4)
      ctx.fillText('0.00%', plotL + plotW + 3, preCloseY)
      ctx.fillText(`-${pctSpread.toFixed(1)}%`, plotL + plotW + 3, plotT + priceH - 4)
    } else {
      ctx.fillText('0.00%', plotL + plotW + 3, preCloseY)
    }

    // Bottom timeline labels: 09:15, 09:20, 09:25
    ctx.textAlign = 'center'
    ctx.fillStyle = AXIS_TEXT
    ctx.fillText('09:15', plotL + 8, volT + volH + 7)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)'
    ctx.fillText('09:20', dividerX, volT + volH + 7)
    ctx.fillStyle = AXIS_TEXT
    ctx.fillText('09:25', plotL + plotW - 10, volT + volH + 7)
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
