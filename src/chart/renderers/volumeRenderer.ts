//! Minute volume subchart rendering with robust intraday scaling.
//!
//! Follows AGENTS.md §11 (colocation + lean design) and §15 (theme adaptability).

import { fmtVol } from '../../types'
import { FONT } from '../theme'

export interface UnifiedVolumeItem {
  x: number
  slot: number
  isAuction?: boolean
  vol: number
  isUp?: boolean
  matchedVol?: number
  unmatchedVol?: number
  unmatchedSide?: 'buy' | 'sell' | 'none'
}

export interface DrawMinuteVolumeOptions {
  ctx: CanvasRenderingContext2D
  plotL: number
  plotW: number
  volT: number
  volH: number
  subPlotH: number
  items: UnifiedVolumeItem[]
  barWidth: number
  activeIdx?: number | null
}

export function drawMinuteVolumeSubchart(opts: DrawMinuteVolumeOptions): void {
  const { ctx, plotL, plotW, volT, volH, subPlotH, items, barWidth } = opts
  const count = items.length
  if (count === 0) return

  const isLight = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
  const colorUp = isLight ? '#dc2626' : 'rgba(239, 68, 68, 0.88)'
  const colorDown = isLight ? '#16a34a' : 'rgba(34, 197, 94, 0.88)'
  const colorAuctionMatched = isLight ? 'rgba(148, 163, 184, 0.7)' : 'rgba(156, 163, 175, 0.45)'

  // Separate continuous trading volumes from auction orders to prevent
  // morning/closing call auction outliers from crushing intraday bars.
  const continuousVols: number[] = []
  let continuousMax = 0
  for (let i = 0; i < count; i++) {
    const it = items[i]
    if (!it.isAuction && it.vol > 0) {
      continuousVols.push(it.vol)
      if (it.vol > continuousMax) continuousMax = it.vol
    }
  }

  // Fallback to all items if no continuous points exist yet
  let effectiveCeiling = continuousMax
  if (continuousVols.length >= 8) {
    continuousVols.sort((a, b) => a - b)
    const p90 = continuousVols[Math.floor(continuousVols.length * 0.90)]
    // Outlier dampening: cap at 2.2x of 90th percentile if spike exceeds it
    effectiveCeiling = continuousMax > p90 * 2.2 ? p90 * 2.0 : continuousMax
  } else if (continuousMax <= 0) {
    for (let i = 0; i < count; i++) {
      if (items[i].vol > effectiveCeiling) effectiveCeiling = items[i].vol
    }
  }

  if (effectiveCeiling <= 0) effectiveCeiling = 1
  const sqrtCeiling = Math.sqrt(effectiveCeiling)

  for (let i = 0; i < count; i++) {
    const it = items[i]
    if (it.vol <= 0) continue

    const cx = it.x
    const w = Math.max(1, barWidth)
    const x0 = cx - w / 2

    if (it.isAuction) {
      // 竞价双层量柱: 下层匹配量 + 上层未匹配单，最高顶格 subPlotH
      const matched = it.matchedVol ?? it.vol
      const unmatched = it.unmatchedVol ?? 0
      const matchedH = matched > 0 ? Math.min(subPlotH, (Math.sqrt(matched) / sqrtCeiling) * subPlotH) : 0

      if (matchedH > 0) {
        ctx.fillStyle = colorAuctionMatched
        ctx.fillRect(x0, volT + volH - matchedH, w, Math.max(1, matchedH))
      }

      if (unmatched > 0) {
        const totalH = Math.min(subPlotH, (Math.sqrt(matched + unmatched) / sqrtCeiling) * subPlotH)
        const unmatchedH = Math.max(1, totalH - matchedH)
        const unmatchedY = volT + volH - totalH
        const color =
          it.unmatchedSide === 'buy'
            ? colorUp
            : it.unmatchedSide === 'sell'
              ? colorDown
              : colorAuctionMatched
        ctx.fillStyle = color
        ctx.fillRect(x0, unmatchedY, w, unmatchedH)
      }
    } else {
      // 连续交易常规单层柱: 红涨绿跌，确保最小可见高度 2px，充分吃满副图
      const barH = Math.min(subPlotH, Math.max(2, (Math.sqrt(it.vol) / sqrtCeiling) * subPlotH))
      ctx.fillStyle = it.isUp ? colorUp : colorDown
      ctx.fillRect(x0, volT + volH - barH, w, barH)

      // Spike cap marker if exceeding ceiling
      if (it.vol > effectiveCeiling * 1.05) {
        ctx.fillStyle = isLight ? '#0f172a' : '#ffffff'
        ctx.fillRect(x0, volT + volH - subPlotH, w, 1)
      }
    }
  }

  // Active hover label or latest bar legend
  const activeIdx =
    opts.activeIdx != null && opts.activeIdx >= 0 && opts.activeIdx < count
      ? opts.activeIdx
      : count - 1
  const active = items[activeIdx]

  ctx.font = FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.78)' : 'rgba(255, 255, 255, 0.75)'

  if (active?.isAuction) {
    const sideStr =
      active.unmatchedSide === 'buy'
        ? ' 买多'
        : active.unmatchedSide === 'sell'
          ? ' 卖多'
          : ''
    ctx.fillText(
      `配:${fmtVol(active.matchedVol ?? 0)} 未:${fmtVol(active.unmatchedVol ?? 0)}${sideStr}`,
      plotL + 2,
      volT + 1
    )
  } else {
    ctx.fillText(`量:${fmtVol(active ? active.vol : continuousMax)}`, plotL + 2, volT + 1)
  }

  // Right-aligned scale label: show true continuous peak volume
  ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.42)' : 'rgba(255, 255, 255, 0.35)'
  ctx.textAlign = 'left'
  ctx.fillText(`${fmtVol(continuousMax > 0 ? continuousMax : effectiveCeiling)}`, plotL + plotW + 3, volT + 1)
}
