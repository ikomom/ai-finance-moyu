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

