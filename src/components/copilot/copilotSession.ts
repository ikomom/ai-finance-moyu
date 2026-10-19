//! Session and watchlist helpers for the copilot window.
//!
//! Extracted from `CopilotApp.tsx` to keep the component focused on layout
//! (AGENTS.md §11 colocation guidance).

import { invoke } from '@tauri-apps/api/core'
import type { ChatSession } from '../../types/agent'
import type { StockQuoteBrief } from './CopilotHeader'


/** Create (but do not persist) a fresh chat session for the current focus. */
export function makeSession(
  symbol: string | null,
  name: string | null
): ChatSession {
  const now = Date.now()
  return {
    id: `sess_${now}`,
    title: name ? `${name} · 盘面推演` : '全市场宏观复盘',
    symbol: symbol ?? undefined,
    symbol_name: name ?? undefined,
    created_at: now,
    updated_at: now,
    messages: [],
  }
}

/** Pull the watchlist + latest quotes that the copilot header renders. */
export async function loadWatchlistQuotes(): Promise<{
  watchlist: Array<{ code: string; name: string }>
  quotes: Record<string, StockQuoteBrief>
  firstSymbol: string | null
  firstName: string | null
}> {
  const snap = await invoke<any>('get_snapshot')
  const wList: any[] = snap?.config?.watchlist || []
  const quotes: Record<string, StockQuoteBrief> = {}
  for (const q of snap?.quotes ?? []) {
    quotes[q.code] = { name: q.name, price: q.price, changePct: q.changePct }
  }
  const watchlist = wList.map((w: any) => ({
    code: w.code,
    name: w.name || quotes[w.code]?.name || w.code,
  }))
  const first = watchlist[0]
  return {
    watchlist,
    quotes,
    firstSymbol: first?.code ?? null,
    firstName: first?.name ?? null,
  }
}
