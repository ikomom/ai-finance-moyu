import type { VolumeProfileData } from '../volumeProfile'
import { getPocRelation } from '../volumeProfile'
import type { ChartTheme } from '../theme'

export interface VolumeProfileRenderOptions {
  ctx: CanvasRenderingContext2D
  profile: VolumeProfileData
  plotL: number
  plotW: number
  plotT: number
  priceH: number
  yOf: (price: number) => number
  theme: ChartTheme
  currentPrice?: number
}

/**
 * Draw Volume Profile (筹码分布峰 / 成交密集柱 + POC 支撑压力线)
 * on the right side of the intraday trend chart canvas.
 */
export function drawVolumeProfile(opts: VolumeProfileRenderOptions): void {
  const { ctx, profile, plotL, plotW, plotT, priceH, yOf, currentPrice } = opts
  if (!profile.bins.length || profile.maxBinVolume <= 0) return

  const isLight = document.documentElement.getAttribute('data-theme') === 'light'
  const rightX = plotL + plotW
  const maxBarWidth = Math.max(20, Math.min(plotW * 0.24, 80))

  ctx.save()

  // 1. Draw horizontal volume profile bars
  for (const bin of profile.bins) {
    if (bin.volume <= 0) continue

    const yTop = Math.min(yOf(bin.priceMax), yOf(bin.priceMin))
    const yBottom = Math.max(yOf(bin.priceMax), yOf(bin.priceMin))
    const barH = Math.max(1.5, yBottom - yTop)

    // Clip to price section
    if (yTop < plotT - 2 || yBottom > plotT + priceH + 2) continue

    const widthRatio = bin.volume / profile.maxBinVolume
    const barW = Math.max(2, widthRatio * maxBarWidth)
    const barX = rightX - barW

    const isPoc = bin === profile.pocBin
    const inValueArea = bin.priceCenter >= profile.valPrice && bin.priceCenter <= profile.vahPrice

    if (isPoc) {
      ctx.fillStyle = isLight ? 'rgba(234, 179, 8, 0.45)' : 'rgba(250, 204, 21, 0.38)'
    } else if (inValueArea) {
      ctx.fillStyle = isLight ? 'rgba(99, 102, 241, 0.22)' : 'rgba(129, 140, 248, 0.20)'
    } else {
      ctx.fillStyle = isLight ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.14)'
    }

    ctx.fillRect(barX, yTop, barW, barH)

    // Right-edge subtle anchor border
    ctx.fillStyle = isPoc
      ? 'rgba(234, 179, 8, 0.85)'
      : inValueArea
      ? 'rgba(99, 102, 241, 0.5)'
      : 'rgba(148, 163, 184, 0.3)'
    ctx.fillRect(rightX - 1.5, yTop, 1.5, barH)
  }

  // 2. Draw golden POC horizontal line & right badge
  const pocY = yOf(profile.pocPrice)
  if (pocY >= plotT && pocY <= plotT + priceH) {
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = isLight ? '#d97706' : '#facc15'
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.moveTo(plotL, pocY)
    ctx.lineTo(rightX, pocY)
    ctx.stroke()
    ctx.setLineDash([])

    // Right badge
    const rel = getPocRelation(currentPrice ?? profile.pocPrice, profile.pocPrice)
    const text = `POC ${profile.pocPrice.toFixed(2)} ${rel.label}`
    ctx.font = '9px var(--font-mono, monospace)'
    const tw = ctx.measureText(text).width
    const badgeW = tw + 8
    const badgeH = 14
    const badgeX = Math.max(plotL + 4, rightX - badgeW - 2)
    const badgeY = pocY - badgeH / 2

    // Badge background pill
    ctx.fillStyle = isLight ? 'rgba(254, 243, 199, 0.95)' : 'rgba(30, 27, 75, 0.92)'
    ctx.strokeStyle = isLight ? '#d97706' : '#facc15'
    ctx.lineWidth = 1

    ctx.beginPath()
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 2)
    ctx.fill()
    ctx.stroke()

    // Badge text
    ctx.fillStyle = isLight ? '#b45309' : '#fde047'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(text, badgeX + 4, pocY)
  }

  ctx.restore()
}
