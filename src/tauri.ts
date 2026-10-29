import { invoke } from '@tauri-apps/api/core'
import type { KlinePeriod, KLineData, Trend } from './types'

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
 * Request daily candlestick series for global indices from backend.
 */
export async function fetchGlobalKLine(code: string): Promise<KLineData | null> {
  if (!inTauri()) return null
  try {
    return await invoke<KLineData>('get_global_kline', { code })
  } catch (e) {
    logToBackend(`fetchGlobalKLine failed for ${code}: ${e}`)
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
