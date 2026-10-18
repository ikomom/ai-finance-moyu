import type { PriceLine, Trend } from '../types'

export interface DrawOptions {
  trend: Trend | undefined
  /** Fallback 昨收 when the trend payload hasn't arrived yet. */
  preClose: number
  costPrice?: number | null
  priceLines?: PriceLine[]
  /** Latest price, marked with a dot at the end of the series. */
  lastPrice?: number
  compact?: boolean
  hoverSlot?: number | null
  orbHigh?: number | null
  orbLow?: number | null
  subchartMode?: 'vol' | 'macd'
  macdParams?: [number, number, number]
  isGlobal?: boolean
}

export interface LevelOptions {
  price: number | null
  yMin: number
  yTop: number
  yOf: (price: number) => number
  plotL: number
  plotW: number
  plotT: number
  plotH: number
  color: string
  dash: number[]
  label?: string
}

export interface MacdDiagnosis {
  text: string
  color: string
}
