//! Shared paint context for the K-line renderer.
//!
//! The renderer was one 500-line function; splitting it needs a single explicit
//! bundle of the values every stage reads (AGENTS.md §11).

import type { KLineBar } from '../types'
import type { KlineDrawProps } from './klineDraw'

export interface KlinePaint {
  ctx: CanvasRenderingContext2D
  props: KlineDrawProps
  /** Bars visible in the current window, left to right. */
  slice: KLineBar[]
  /** Full series, needed by the MA recursion which looks back before the window. */
  allBars: KLineBar[]
  startIdx: number
  slotW: number
  barW: number
  plotL: number
  plotW: number
  priceT: number
  priceH: number
  volT: number
  volH: number
  /** Volume pane minus the label strip; both the VOL and MACD stages scale by it. */
  subPlotH: number
  chartTheme: { axisText: string; grid: string }
  xOfIdx: (i: number) => number
  yOfPrice: (p: number) => number
  yOfVol: (v: number) => number
  hoveredIndex: () => number | null
}

/**
 * Determine whether a K-line bar is bullish (up/red) or bearish (down/green) in Chinese A-share rules:
 * - close > open: Red (阳线)
 * - close < open: Green (阴线)
 * - close === open (平开平收、一字板、十字星):
 *   Determined by comparison with previous bar's close:
 *   - close >= prev.close: Red (一字涨停、平盘收涨)
 *   - close < prev.close: Green (一字跌停、平盘收跌，如慈文传媒跌停)
 */
export function isBarUp(bar: KLineBar, prevBar?: KLineBar | null): boolean {
  if (bar.close > bar.open) return true
  if (bar.close < bar.open) return false
  if (prevBar && prevBar.close > 0) {
    return bar.close >= prevBar.close
  }
  return true
}


