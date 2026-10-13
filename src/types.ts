// Mirrors the serde camelCase shapes emitted from src-tauri/src/quote.rs,
// config.rs and state.rs.

export type LineDirection = 'above' | 'below'

export interface PriceLine {
  price: number
  label?: string | null
  direction: LineDirection
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
}

export interface SearchResult {
  code: string
  name: string
  pinyin: string
  category: string
}

export type Layout = 'bar' | 'mini' | 'list' | 'market'

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

export interface Config {
  watchlist: WatchItem[]
  layout: Layout
  opacity: number
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
}

export interface AnomalyAlertConfig {
  rapidChange: boolean
  intradayExtremes: boolean
  volumeBurst: boolean
  limitBoard: boolean
}

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

export type AuctionTag = 'normal' | 'bull_trap' | 'bear_trap' | 'snatching' | 'dumping'

export interface AuctionPoint {
  /** 24h format HHMM, e.g. 915, 918, 920. */
  time: number
  price: number
  volume: number
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
  diagnosis?: AuctionDiagnosis | null
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
}

/** A股 convention: red is up, green is down — inverted from Western markets. */
export const UP = '#e64545'
export const DOWN = '#2fae66'
export const AVG = '#e8b339'

export function trendColor(changePct: number): string {
  if (changePct > 0) return UP
  if (changePct < 0) return DOWN
  return '#9ca3af'
}

export function fmtPrice(v: number, digits = 2): string {
  return v.toFixed(digits)
}

export function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function fmtSigned(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`
}

/** 浮盈 relative to an entry price. */
export function profitPct(price: number, costPrice: number): number | null {
  if (costPrice <= 0 || price <= 0) return null
  return ((price - costPrice) / costPrice) * 100
}

/** 浮动盈亏金额 (元). */
export function profitAmount(price: number, costPrice?: number | null, shares?: number | null): number | null {
  if (costPrice == null || shares == null || shares <= 0 || price <= 0) return null
  return (price - costPrice) * shares
}

/** 今日盈亏金额 (元). */
export function todayProfitAmount(price: number, preClose: number, shares?: number | null): number | null {
  if (shares == null || shares <= 0 || !preClose || price <= 0) return null
  return (price - preClose) * shares
}

export function fmtMoney(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  const abs = Math.abs(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}¥${abs}`
}

/** `0930` -> `9:30`. */
export function fmtHHMM(t: number): string {
  const h = Math.floor(t / 100)
  const m = t % 100
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * Security names arrive from the quote feed, so they're escaped before being
 * interpolated into markup.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** CSS class for a change value, following the 红涨绿跌 convention. */
export function trendClass(changePct: number): string {
  if (changePct > 0) return 'up'
  if (changePct < 0) return 'down'
  return 'flat'
}

/** Check if symbol represents an index (no individual call auction or VWAP) */
export function isIndexCode(code: string): boolean {
  return code.startsWith('sh000') || code.startsWith('sz399') || code.startsWith('bj899')
}
