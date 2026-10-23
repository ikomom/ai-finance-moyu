//! Market data payloads mirrored from the Rust `quote` module.
//!
//! Split from `types.ts` to stay inside the 300-line budget (AGENTS.md §11).

import type { Config, DockState, MarketOverview, TrendSignal } from './config'


export interface Quote {
  code: string
  name: string
  price: number
  preClose: number
  open: number
  high: number
  low: number
  volume: number
  change: number
  changePct: number
  date: string
  time: string
  bids?: [number, number][]
  asks?: [number, number][]
  outerVol?: number
  innerVol?: number
  bidAskImbalance?: number
  activeBuyRatio?: number
}

export interface TrendPoint {
  /** `HHMM` as a number, e.g. `930`. */
  time: number
  price: number
  cumVolume: number
  cumAmount: number
  avgPrice: number
}

export interface Trend {
  code: string
  date: string
  preClose: number
  points: TrendPoint[]
}

export type UnmatchedSide = 'none' | 'buy' | 'sell'

export type AuctionTag = 'normal' | 'bull_trap' | 'bear_trap' | 'snatching' | 'dumping'

export interface AuctionPoint {
  /** 24h format HHMM or HHMMSS, e.g. 915, 91825, 145812. */
  time: number
  /** Formatted time string, e.g. "09:18:25" or "14:58:12". */
  rawTime?: string
  price: number
  /** Total volume (matched + unmatched) in 手. */
  volume: number
  /** Matched volume in 手. */
  matchedVolume?: number
  /** Unmatched residual order volume in 手. */
  unmatchedVolume?: number
  /** Direction of unmatched order volume: 'none' | 'buy' | 'sell'. */
  unmatchedSide?: UnmatchedSide
}

export interface AuctionDiagnosis {
  tag: AuctionTag
  label: string
  detail: string
  earlyPeakPct: number
  lockedPct: number
  volumeDropPct?: number | null
}

export interface AuctionData {
  code: string
  date: string
  points: AuctionPoint[]
  closingPoints?: AuctionPoint[]
  diagnosis?: AuctionDiagnosis | null
}

export interface KLineBar {
  date: string
  open: number
  close: number
  high: number
  low: number
  volume: number
  ma5?: number | null
  ma10?: number | null
  ma20?: number | null
  dif?: number | null
  dea?: number | null
  macd?: number | null
  k?: number | null
  d?: number | null
  j?: number | null
}

export type KLineSignal = 'bull_aligned' | 'above_ma20' | 'below_ma20' | 'bear_aligned' | 'neutral'

export interface KLineData {
  code: string
  bars: KLineBar[]
  maSignal: KLineSignal
  maComment: string
  kdjStatus?: string | null
  support?: number | null
  resistance?: number | null
  klineAction?: string | null
  klineTone?: string | null
}

export interface PollStatus {
  lastUpdate?: string | null
  error?: string | null
  feedDate?: string | null
  tradingToday: boolean
  session: string
}

export interface Snapshot {
  config: Config
  quotes: Quote[]
  trends: Record<string, Trend>
  trendSignals: Record<string, TrendSignal>
  auctions: Record<string, AuctionData>
  status: PollStatus
  dock: DockState
  marketOverview?: MarketOverview | null
  /**
   * Whether an iWenCai key is stored. The key itself is stripped from `config`
   * before the snapshot leaves the backend, so it can never reach the webview.
   */
  hasIwenCaiKey?: boolean
}
/** A structured row from the backend ring buffer (`logger::LogEntry`). */
export interface LogEntry {
  timestamp: string
  level: string
  target: string
  message: string
}