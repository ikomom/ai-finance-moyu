//! Session-aware cache validation and timestamp helpers for System-1 AI Decision Engine.
//!
//! Split from `useAiDecision.ts` to keep both modules inside the 300-line budget (AGENTS.md §11).

import type { StockDecisionResult } from '../types/aiDecision'

export interface DecisionCacheEntry {
  result: StockDecisionResult
  ts: number
  date?: string
  quoteTime?: string
  session?: string
  isClosing?: boolean
}

export interface DecisionCacheCheckContext {
  now?: number
  session?: string
  tradingToday?: boolean
  quoteDate?: string
  quoteTime?: string
  feedDate?: string
}

export const DECISION_CACHE = new Map<string, DecisionCacheEntry>()
export const CACHE_TTL_MS = 30_000

/** Normalize `"YYYYMMDDHHMMSS"` or `"HH:MM:SS"` into comparable `"HH:MM:SS"`. */
export function extractHHMMSS(raw?: string): string {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{14}$/.test(s)) return `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`
  return s
}

export function isLiveDecisionSession(session?: string): boolean {
  return session === 'Morning' || session === 'Afternoon' || session === 'ClosingAuction'
}

/**
 * 校验决策缓存有效性（包含交易时段感知与收盘智能冻结）.
 */
export function isDecisionCacheValid(
  cached: DecisionCacheEntry | undefined,
  ctx: DecisionCacheCheckContext,
  ttlMs = CACHE_TTL_MS
): boolean {
  if (!cached) return false

  const curDate = ctx.quoteDate || ctx.feedDate
  if (curDate && cached.date && cached.date !== curDate) {
    return false
  }

  const isTradingToday = ctx.tradingToday ?? true
  const session = ctx.session
  const now = ctx.now ?? Date.now()

  // 1. 收盘或非交易日（周末/法定节假日）
  if (!isTradingToday || session === 'Closed') {
    return Boolean(cached.isClosing)
  }

  // 2. 午间休市 (11:31 - 12:59)
  if (session === 'LunchBreak') {
    const cachedClock = extractHHMMSS(cached.quoteTime)
    if (cached.session === 'LunchBreak' || (cachedClock && cachedClock >= '11:30:00')) {
      return true
    }
    return now - cached.ts < ttlMs
  }

  // 3. 盘前未开盘 (00:00 - 09:14)
  if (session === 'PreOpen') {
    return true
  }

  // 4. 连续交易及竞价时段：依常规 TTL 随盘面轮询刷新
  return now - cached.ts < ttlMs
}
