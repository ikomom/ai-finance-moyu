//! Axis and label painting for the call-auction chart.
//!
//! Extracted from `auctionDraw.ts` to keep both files inside the 300-line
//! budget (AGENTS.md §11).

import { getChartTheme } from '../chart'
import type { AuctionData, AuctionPoint } from '../types'

export interface AuctionCanvasProps {
  auction?: AuctionData | null
  preClose: number
  compact?: boolean
  onHover?: (point: AuctionPoint | null) => void
}

export interface AuctionAxisGeometry {
  plotL: number
  plotT: number
  plotW: number
  priceH: number
  volT: number
  volH: number
  preCloseY: number
  dividerX: number
}

export function drawAuctionAxis(
  ctx: CanvasRenderingContext2D,
  geo: AuctionAxisGeometry,
  preClose: number,
  maxDev: number
): void {
  const { plotL, plotT, plotW, priceH, volT, volH, preCloseY, dividerX } = geo
  // 9. Scales & Axis Labels
    const chartTheme = getChartTheme()
    ctx.fillStyle = chartTheme.axisText
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
    ctx.fillStyle = chartTheme.axisText
    ctx.fillText('09:15', plotL + 8, volT + volH + 7)
    ctx.fillStyle = 'rgba(245, 158, 11, 0.85)'
    ctx.fillText('09:20', dividerX, volT + volH + 7)
    ctx.fillStyle = chartTheme.axisText
    ctx.fillText('09:25', plotL + plotW - 10, volT + volH + 7)
}
