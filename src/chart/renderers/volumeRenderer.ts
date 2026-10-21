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

  let maxVol = 0
  for (let i = 0; i < count; i++) {
    const v = items[i].vol
    if (v > maxVol) maxVol = v
  }

  if (maxVol <= 0) return

  const sqrtMax = Math.sqrt(maxVol) || 1
  for (let i = 0; i < count; i++) {
    const it = items[i]
    if (it.vol <= 0) continue

    const cx = it.x
    const w = barWidth
    const x0 = cx - w / 2

    if (it.isAuction) {
      // 竞价双层量柱: 下层灰色匹配量 + 上层红绿未匹配单
      const matched = it.matchedVol ?? it.vol
      const unmatched = it.unmatchedVol ?? 0
      const matchedH = matched > 0 ? (Math.sqrt(matched) / sqrtMax) * subPlotH : 0

      if (matchedH > 0) {
        ctx.fillStyle = 'rgba(156, 163, 175, 0.45)'
        ctx.fillRect(x0, volT + volH - matchedH, w, Math.max(1, matchedH))
      }

      if (unmatched > 0) {
        const totalH = (Math.sqrt(matched + unmatched) / sqrtMax) * subPlotH
        const unmatchedH = Math.max(1, totalH - matchedH)
        const unmatchedY = volT + volH - totalH
        const color =
          it.unmatchedSide === 'buy'
            ? 'rgba(239, 68, 68, 0.85)'
            : it.unmatchedSide === 'sell'
              ? 'rgba(34, 197, 94, 0.85)'
              : 'rgba(156, 163, 175, 0.75)'
        ctx.fillStyle = color
        ctx.fillRect(x0, unmatchedY, w, unmatchedH)
      }
    } else {
      // 连续交易常规单层柱: 红涨绿跌
      const barH = Math.max(1, (Math.sqrt(it.vol) / sqrtMax) * subPlotH)
      ctx.fillStyle = it.isUp ? 'rgba(239, 68, 68, 0.82)' : 'rgba(34, 197, 94, 0.82)'
      ctx.fillRect(x0, volT + volH - barH, w, barH)
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'

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
    ctx.fillText(`量:${fmtVol(active ? active.vol : maxVol)}`, plotL + 2, volT + 1)
  }

  // Right-aligned max volume label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.textAlign = 'left'
  ctx.fillText(`${fmtVol(maxVol)}`, plotL + plotW + 3, volT + 1)
}
