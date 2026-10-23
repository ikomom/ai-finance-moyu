//! Configuration schema shared with the Rust backend (`config` module).
//!
//! Split from `types.ts` to stay inside the 300-line budget (AGENTS.md §11).

// Mirrors the serde camelCase shapes emitted from src-tauri/src/quote.rs,
// config.rs and state.rs.

export type LineDirection = 'above' | 'below'

import type { AiDecisionConfig } from './aiDecision'

export interface PriceLine {
  price: number
  label?: string | null
  direction: LineDirection
}

export type IndicatorPreset = 'ultra_short' | 'classic' | 'swing' | 'custom'
export type StockIndicatorMode = 'inherit' | IndicatorPreset

export interface IndicatorConfig {
  preset: IndicatorPreset
  ma: [number, number, number]
  macd: [number, number, number]
}

export const INDICATOR_PRESETS: Record<
  Exclude<IndicatorPreset, 'custom'>,
  { ma: [number, number, number]; macd: [number, number, number]; label: string; shortLabel: string }
> = {
  ultra_short: {
    label: '极速超短 (MA 3/5/10 · MACD 6/13/5)',
    shortLabel: '极速超短',
    ma: [3, 5, 10],
    macd: [6, 13, 5],
  },
  classic: {
    label: '经典短线 (MA 5/10/20 · MACD 12/26/9)',
    shortLabel: '经典短线',
    ma: [5, 10, 20],
    macd: [12, 26, 9],
  },
  swing: {
    label: '中线波段 (MA 10/30/60 · MACD 19/39/9)',
    shortLabel: '中线波段',
    ma: [10, 30, 60],
    macd: [19, 39, 9],
  },
}

export function resolveIndicatorParams(
  item?: WatchItem | null,
  global?: IndicatorConfig | null
): { ma: [number, number, number]; macd: [number, number, number] } {
  const effectiveGlobal: IndicatorConfig = global ?? {
    preset: 'classic',
    ma: [5, 10, 20],
    macd: [12, 26, 9],
  }

  const mode = item?.indicatorMode ?? 'inherit'

  if (mode === 'ultra_short') {
    return { ma: INDICATOR_PRESETS.ultra_short.ma, macd: INDICATOR_PRESETS.ultra_short.macd }
  }
  if (mode === 'classic') {
    return { ma: INDICATOR_PRESETS.classic.ma, macd: INDICATOR_PRESETS.classic.macd }
  }
  if (mode === 'swing') {
    return { ma: INDICATOR_PRESETS.swing.ma, macd: INDICATOR_PRESETS.swing.macd }
  }
  if (mode === 'custom') {
    return {
      ma: item?.customMa ?? effectiveGlobal.ma ?? [5, 10, 20],
      macd: item?.customMacd ?? effectiveGlobal.macd ?? [12, 26, 9],
    }
  }

  // mode === 'inherit' -> check global preset
  if (effectiveGlobal.preset === 'ultra_short') {
    return { ma: INDICATOR_PRESETS.ultra_short.ma, macd: INDICATOR_PRESETS.ultra_short.macd }
  }
  if (effectiveGlobal.preset === 'swing') {
    return { ma: INDICATOR_PRESETS.swing.ma, macd: INDICATOR_PRESETS.swing.macd }
  }
  if (effectiveGlobal.preset === 'custom') {
    return {
      ma: effectiveGlobal.ma ?? [5, 10, 20],
      macd: effectiveGlobal.macd ?? [12, 26, 9],
    }
  }
  return { ma: INDICATOR_PRESETS.classic.ma, macd: INDICATOR_PRESETS.classic.macd }
}

export interface WatchItem {
  /** Canonical prefixed code, e.g. `sh600000`. */
  code: string
  /** Cached Chinese name, e.g. `贵州茅台`. */
  name?: string | null
  costPrice?: number | null
  shares?: number | null
  alertPct?: number | null
  priceLines?: PriceLine[]
  /** Indicator mode override: 'inherit' | 'ultra_short' | 'classic' | 'swing' | 'custom' */
  indicatorMode?: StockIndicatorMode | null
  customMa?: [number, number, number] | null
  customMacd?: [number, number, number] | null
}

export interface SearchResult {
  code: string
  name: string
  pinyin: string
  category: string
}

export type Layout = 'bar' | 'mini' | 'list' | 'market' | 'global'

/** Which upstream provider to fetch from. */
export type DataSource = 'tencent' | 'sina'

/** Window visibility and auto-collapse mode. */
export type VisibilityMode = 'always' | 'hover' | 'dblclick' | 'hotkey'

export type DockEdge = 'none' | 'left' | 'right' | 'top'

export interface DockState {
  edge: DockEdge
  collapsed: boolean
}

/**
 * A display-window size the user set by resizing, per layout. An absent entry
 * means the layout keeps auto-sizing (the bar layout grows with the watchlist).
 */
export interface LayoutSizes {
  bar?: [number, number]
  mini?: [number, number]
  list?: [number, number]
  market?: [number, number]
  global?: [number, number]
}

export interface WindowGeom {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Global shortcut chords, as strings the global-shortcut plugin accepts.
 *
 * `Ctrl+Alt` rather than `Ctrl+Shift`: on Chinese Windows the latter is the IME
 * switch chord, so those chords would switch input methods as a side effect.
 */
export interface Hotkeys {
  /** Show/hide — the 老板键. */
  toggle: string
  layoutBar: string
  layoutMini: string
  layoutList: string
  layoutMarket: string
  layoutGlobal: string
}

export interface MarketIndex {
  code: string
  name: string
  price: number
  change: number
  changePct: number
  turnover: number
  upCount: number
  downCount: number
  flatCount: number
}

export interface SectorItem {
  code: string
  name: string
  changePct: number
  upCount: number
  downCount: number
  leadStockName: string
  leadStockCode?: string
  leadStockZdf?: number
}

export interface SectorLinkage {
  sectorCode: string
  sectorName: string
  sectorChangePct: number
  deltaRSector: number
  deltaRMarket: number
  leaderCode: string
  leaderName: string
  leaderChangePct: number
  role: string
  diagnosis: string
}

export interface MarketOverview {
  indices: MarketIndex[]
  upCount: number
  downCount: number
  flatCount: number
  totalTurnover: number
  turnoverChangePct?: number | null
  turnoverChangeAmount?: number | null
  northNetFlow?: number | null
  topSectors: SectorItem[]
  updatedAt: string
  globalIndices?: MarketIndex[]
}

export type TrendState =
  | 'breakoutPullback'
  | 'volumeSurge'
  | 'steadyBull'
  | 'topDivergence'
  | 'breakdown'
  | 'vwapResistance'
  | 'vwapOverbought'
  | 'vwapOversold'
  | 'bottomRebound'
  | 'consolidation'
  | 'neutral'
  | 'springRebound'
  | 'aggressiveBuying'
  | 'panicDumping'
  | 'illiquidDrift'
  | 'independentAlpha'
  | 'soloPlunge'
  | 'orbBreakoutUp'
  | 'orbBreakdownDown'

export interface TrendSignal {
  state: TrendState
  label: string
  compactLabel: string
  score: number
  biasPct: number
  summary: string
  updatedAt: number
  orbHigh?: number | null
  orbLow?: number | null
  sectorLinkage?: SectorLinkage | null
}

export type ThemePreset = 'dark' | 'light' | 'transparent' | 'ocean' | 'cyberpunk'

export interface ThemeOption {
  value: ThemePreset
  name: string
  badge: string
  desc: string
  icon: string
  palette: {
    bg: string
    card: string
    border: string
    accent: string
    text: string
    up: string
    down: string
  }
}

export interface Config {
  watchlist: WatchItem[]
  layout: Layout
  opacity: number
  theme?: ThemePreset
  dataSource: DataSource
  layoutSizes?: LayoutSizes
  hotkeys: Hotkeys
  alertPct: number
  pollQuotesMs: number
  pollTrendMs: number
  notifications: boolean
  autostart: boolean
  window: WindowGeom
  visibilityMode: VisibilityMode
  trendEngine: boolean
  anomalyAlerts?: AnomalyAlertConfig
  iwencaiApiKey?: string
  indicatorConfig?: IndicatorConfig
  aiDecision?: AiDecisionConfig
}

export interface AnomalyAlertConfig {
  rapidChange: boolean
  intradayExtremes: boolean
  volumeBurst: boolean
  limitBoard: boolean
}
