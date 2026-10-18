import { fmtVol } from '../../types'
import { FONT } from '../theme'

export interface DrawMinuteVolumeOptions {
  ctx: CanvasRenderingContext2D
  plotL: number
  plotW: number
  volT: number
  volH: number
  subPlotH: number
  volumes: number[]
  isUpList: boolean[]
  getX: (index: number) => number
  barWidth: number
  activeIdx?: number | null
}

export function drawMinuteVolumeSubchart(opts: DrawMinuteVolumeOptions): void {
  const { ctx, plotL, plotW, volT, volH, subPlotH, volumes, isUpList, getX, barWidth } = opts
  const count = volumes.length
  if (count === 0) return

  let maxVol = 0
  for (let i = 0; i < count; i++) {
    if (volumes[i] > maxVol) maxVol = volumes[i]
  }

  if (maxVol > 0) {
    const sqrtMax = Math.sqrt(maxVol) || 1
    for (let i = 0; i < count; i++) {
      const v = volumes[i]
      if (v <= 0) continue
      const cx = getX(i)
      const barH = Math.max(1, (Math.sqrt(v) / sqrtMax) * subPlotH)
      const isUp = isUpList[i]
      ctx.fillStyle = isUp ? 'rgba(239, 68, 68, 0.82)' : 'rgba(34, 197, 94, 0.82)'
      ctx.fillRect(cx - barWidth / 2, volT + volH - barH, barWidth, barH)
    }

    const activeIdx = opts.activeIdx != null && opts.activeIdx >= 0 && opts.activeIdx < count
      ? opts.activeIdx
      : count - 1
    const vActive = volumes[activeIdx]

    // Subchart top-left legend
    ctx.font = FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
    ctx.fillText(`量:${fmtVol(vActive > 0 ? vActive : maxVol)}`, plotL + 2, volT + 1)

    // Right-aligned max volume label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    ctx.textAlign = 'left'
    ctx.fillText(`${fmtVol(maxVol)}`, plotL + plotW + 3, volT + 1)
  }
}
