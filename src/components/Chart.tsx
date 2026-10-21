import { createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import {
  computeMinuteMacd,
  drawTrend,
  FULL_SLOTS,
  isFullSpectrumActive,
  SLOTS,
  slotOf,
  slotOfFullTrend,
  type DrawOptions,
} from '../chart'
import type { AuctionPoint, TrendPoint } from '../types'

export interface HoverExtra {
  minVol: number
  dif?: number
  dea?: number
  macd?: number
  auctionPoint?: AuctionPoint | null
}

export interface ChartProps extends DrawOptions {
  onHover?: (point: TrendPoint | null, extra?: HoverExtra | null) => void
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
      auction: props.auction,
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

  // Tracked: reading props inside `draw` subscribes this effect.
  createEffect(draw)

  const findClosestPoint = (
    slot: number | null,
    useFull: boolean
  ): { point: TrendPoint; extra: HoverExtra } | null => {
    if (slot == null) return null
    const isGlobal = props.isGlobal ?? false

    // 1. Morning Auction Range (only in full spectrum mode: slot 0..10)
    const morningAuctionPts = props.auction?.points ?? []
    if (useFull && !isGlobal && slot <= 10 && morningAuctionPts.length > 0) {
      let closestAp = morningAuctionPts[0]
      let minDiff = 999
      for (const ap of morningAuctionPts) {
        const diff = Math.abs(slotOfFullTrend(ap.time) - slot)
        if (diff < minDiff) {
          minDiff = diff
          closestAp = ap
        }
      }
      const matched = closestAp.matchedVolume ?? closestAp.volume
      const unmatched = closestAp.unmatchedVolume ?? 0
      return {
        point: {
          time: closestAp.time,
          price: closestAp.price,
          avgPrice: 0,
          cumVolume: matched + unmatched,
          cumAmount: 0,
        },
        extra: {
          minVol: matched + unmatched,
          auctionPoint: closestAp,
        },
      }
    }

    // 2. Closing Auction Range (full mode: >= 252; standard mode: >= 237)
    const closingThreshold = useFull ? 252 : 237
    const closingPts = props.auction?.closingPoints ?? []
    if (!isGlobal && slot >= closingThreshold && closingPts.length > 0) {
      let closestCp = closingPts[0]
      let minDiff = 999
      for (const cp of closingPts) {
        const pSlot = useFull ? slotOfFullTrend(cp.time) : slotOf(cp.time)
        const diff = Math.abs(pSlot - slot)
        if (diff < minDiff) {
          minDiff = diff
          closestCp = cp
        }
      }
      const matched = closestCp.matchedVolume ?? closestCp.volume
      const unmatched = closestCp.unmatchedVolume ?? 0
      return {
        point: {
          time: closestCp.time,
          price: closestCp.price,
          avgPrice: 0,
          cumVolume: matched + unmatched,
          cumAmount: 0,
        },
        extra: {
          minVol: matched + unmatched,
          auctionPoint: closestCp,
        },
      }
    }

    // 3. Continuous Trend Range
    const points = props.trend?.points ?? []
    if (!points.length) return null

    let closestIdx = 0
    if (isGlobal) {
      closestIdx = Math.min(
        points.length - 1,
        Math.max(0, Math.round((slot / SLOTS) * (points.length - 1)))
      )
    } else {
      let minDiff = 999
      for (let i = 0; i < points.length; i++) {
        const pSlot = useFull ? slotOfFullTrend(points[i].time) : slotOf(points[i].time)
        const diff = Math.abs(pSlot - slot)
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
    return {
      point: pt,
      extra: { minVol, dif: m?.dif, dea: m?.dea, macd: m?.macd },
    }
  }

  createEffect(() => {
    // Reset hover when trend / stock changes
    props.trend
    props.auction
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
    const useFull = isFullSpectrumActive(props)
    const totalSlots = props.isGlobal ? SLOTS : (useFull ? FULL_SLOTS : SLOTS)
    const slot = Math.min(totalSlots, Math.max(0, Math.round((relX / plotW) * totalSlots)))
    setHoverSlot(slot)
    const found = findClosestPoint(slot, useFull)
    props.onHover?.(found?.point ?? null, found?.extra ?? null)
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
