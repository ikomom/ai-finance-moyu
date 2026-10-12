import { invoke } from '@tauri-apps/api/core'

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
