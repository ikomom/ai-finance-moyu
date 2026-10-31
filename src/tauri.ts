import { invoke } from '@tauri-apps/api/core'
import type { KlinePeriod, KLineData, Trend } from './types'
import type { MarketDragonTigerOverview, SeatDetailInfo, StockDetailInfo } from './components/dragon_tiger/types'

/**
 * Whether a Tauri runtime is present to talk to. False when the page is opened
 * in a plain browser, which is how the UI is previewed without a live market.
 */
export function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Best-effort bridge to the process log, for diagnosing a widget that renders
 * nothing (the webview console is not reachable from the terminal).
 */
export function logToBackend(msg: string): void {
  if (!inTauri()) return
  void invoke('frontend_log', { msg }).catch(() => {})
}

/**
 * Inform backend which stocks need intraday trend polling (on-demand loading).
 */
export function setTrendTargets(targets: string[]): void {
  if (!inTauri()) return
  void invoke('set_trend_targets', { targets }).catch(() => {})
}

/**
 * Request candlestick series from backend with optional period.
 */
export async function fetchKLine(code: string, period?: KlinePeriod): Promise<KLineData | null> {
  if (!inTauri()) return null
  try {
    return await invoke<KLineData>('get_kline', { code, period })
  } catch (e) {
    logToBackend(`fetchKLine failed for ${code} (${period ?? 'day'}): ${e}`)
    return null
  }
}

/**
 * Request candlestick series for global indices from backend with optional period.
 */
export async function fetchGlobalKLine(code: string, period?: KlinePeriod): Promise<KLineData | null> {
  if (!inTauri()) return null
  try {
    return await invoke<KLineData>('get_global_kline', { code, period: period ?? 'day' })
  } catch (e) {
    logToBackend(`fetchGlobalKLine failed for ${code} (${period ?? 'day'}): ${e}`)
    return null
  }
}

/**
 * Request intraday minute trend (分时走势) for global indices from backend.
 */
export async function fetchGlobalTrend(code: string): Promise<Trend | null> {
  if (!inTauri()) return null
  try {
    return await invoke<Trend>('get_global_trend', { code })
  } catch (e) {
    logToBackend(`fetchGlobalTrend failed for ${code}: ${e}`)
    return null
  }
}

/**
 * Request intraday minute trend (分时走势) for a single A-share code on demand.
 */
export async function fetchStockTrend(code: string): Promise<Trend | null> {
  if (!inTauri()) return null
  try {
    return await invoke<Trend>('get_stock_trend', { code })
  } catch (e) {
    logToBackend(`fetchStockTrend failed for ${code}: ${e}`)
    return null
  }
}

/**
 * Fetch Dragon & Tiger list for a stock (daily cached).
 */
export async function fetchStockDragonTiger(code: string): Promise<StockDetailInfo | null> {
  if (!inTauri()) return null
  try {
    return await invoke<StockDetailInfo>('get_stock_dragon_tiger', { code })
  } catch (e) {
    logToBackend(`fetchStockDragonTiger failed for ${code}: ${e}`)
    return null
  }
}

/**
 * Fetch whole-market Dragon & Tiger overview.
 */
export async function fetchMarketDragonTiger(): Promise<MarketDragonTigerOverview | null> {
  if (!inTauri()) return null
  try {
    return await invoke<MarketDragonTigerOverview>('get_market_dragon_tiger')
  } catch (e) {
    logToBackend(`fetchMarketDragonTiger failed: ${e}`)
    return null
  }
}

/**
 * Fetch operating department / seat drill-down detail.
 */
export async function fetchSeatDragonTiger(
  branchName: string,
  tradeDate?: string
): Promise<SeatDetailInfo | null> {
  if (!inTauri()) return null
  try {
    return await invoke<SeatDetailInfo>('get_seat_dragon_tiger', {
      branchName,
      tradeDate,
    })
  } catch (e) {
    logToBackend(`fetchSeatDragonTiger failed for ${branchName}: ${e}`)
    return null
  }
}
