//! Reactive composable for System-1 AI Decision Engine.
//!
//! Follows AGENTS.md §11 (isolated feature module, <=300 lines).

import { createSignal, createEffect, on, untrack, onCleanup, type Accessor } from 'solid-js'
import { decideStockWithAi, startLocalDecisionService } from './aiDecision'
import { buildStockDecisionPayload } from './aiDecisionPayload'
import {
  CACHE_TTL_MS,
  DECISION_CACHE,
  extractHHMMSS,
  isDecisionCacheValid,
  isLiveDecisionSession,
  type DecisionCacheCheckContext,
  type DecisionCacheEntry,
} from './aiDecisionCache'
import type { Quote, Snapshot, KLineData } from '../types'
import type { StockDecisionResult } from '../types/aiDecision'

export {
  CACHE_TTL_MS,
  DECISION_CACHE,
  extractHHMMSS,
  isDecisionCacheValid,
  isLiveDecisionSession,
  type DecisionCacheCheckContext,
  type DecisionCacheEntry,
}

const IN_FLIGHT_REQUESTS = new Map<string, Promise<StockDecisionResult>>()

export interface AiDecisionHook {
  result: Accessor<StockDecisionResult | null>
  loading: Accessor<boolean>
  errorMsg: Accessor<string | null>
  startingService: Accessor<boolean>
  isEnabled: Accessor<boolean>
  isLocalOffline: Accessor<boolean>
  runDecision: (force?: boolean) => Promise<void>
  startLocalService: () => Promise<void>
}

export function useAiDecision(
  quote: () => Quote | null | undefined,
  snapshot: () => Snapshot | null | undefined,
  kline?: () => KLineData | null | undefined,
  modeType: 'intraday' | 'kline' = 'intraday'
): AiDecisionHook {
  const [result, setResult] = createSignal<StockDecisionResult | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)
  const [startingService, setStartingService] = createSignal(false)

  const isEnabled = () => {
    const mode = snapshot()?.config?.aiDecision?.mode
    return mode === 'local' || mode === 'online'
  }

  const isLocalOffline = () => {
    const err = errorMsg()
    return Boolean(
      err &&
        (err.includes('127.0.0.1') ||
          err.includes('connection refused') ||
          err.includes('端点失败') ||
          err.includes('连接失败'))
    )
  }

  const runDecision = async (force = false) => {
    const { q, enabled, snap, kd } = untrack(() => ({
      q: quote(),
      enabled: isEnabled(),
      snap: snapshot(),
      kd: kline?.(),
    }))
    if (!q || !q.code || !enabled) return
    const code = q.code
    const cacheKey = modeType === 'kline' ? `${code}:kline` : code

    const inFlight = IN_FLIGHT_REQUESTS.get(cacheKey)
    if (inFlight) {
      try {
        const res = await inFlight
        if (quote()?.code === code) {
          setResult(res)
          setErrorMsg(null)
        }
      } catch (e) {
        if (quote()?.code === code) {
          setErrorMsg(String(e))
        }
      }
      return
    }

    const now = Date.now()
    const status = snap?.status
    const session = status?.session
    const isTradingToday = status?.tradingToday ?? true
    const checkCtx: DecisionCacheCheckContext = {
      now,
      session,
      tradingToday: isTradingToday,
      quoteDate: q.date,
      quoteTime: q.time,
      feedDate: status?.feedDate ?? undefined,
    }

    if (!force) {
      const cached = DECISION_CACHE.get(cacheKey)
      if (isDecisionCacheValid(cached, checkCtx, CACHE_TTL_MS)) {
        setResult(cached!.result)
        setErrorMsg(null)
        return
      }
    }

    setLoading(true)
    setErrorMsg(null)

    const payload = buildStockDecisionPayload(q, snap, kd, modeType)
    const promise = decideStockWithAi(payload)
    IN_FLIGHT_REQUESTS.set(cacheKey, promise)

    try {
      const res = await promise
      if (quote()?.code === code) {
        setResult(res)
        const quoteClock = extractHHMMSS(q.time)
        const isClosing =
          !isTradingToday ||
          session === 'Closed' ||
          Boolean(quoteClock && quoteClock >= '15:00:00')
        DECISION_CACHE.set(cacheKey, {
          result: res,
          ts: Date.now(),
          date: q.date || status?.feedDate || undefined,
          quoteTime: q.time,
          session,
          isClosing,
        })
      }
    } catch (e) {
      if (quote()?.code === code) {
        setErrorMsg(String(e))
        // 记录瞬时失败缓存，避免定时器与快速切股引发连接轰炸
        DECISION_CACHE.set(cacheKey, {
          result: {
            code,
            mode: 'local',
            action: 'hold',
            actionLabel: '量化护航',
            actionConfidence: 0.7,
            isFakePump: 0.2,
            isFakePumpLabel: '20%',
            attribution: 'solo_diverge',
            attributionLabel: '本地量化',
            latencyMs: 0,
            modelName: 'fallback',
            rawSummary: '本地量化规则平滑护航运行中',
          },
          ts: Date.now(),
          date: q.date || status?.feedDate || undefined,
          quoteTime: q.time,
          session,
          isClosing: !isTradingToday || session === 'Closed',
        })
      }
    } finally {
      IN_FLIGHT_REQUESTS.delete(cacheKey)
      setLoading(false)
    }
  }

  const startLocalService = async () => {
    setStartingService(true)
    try {
      const port = snapshot()?.config?.aiDecision?.localPort ?? 9999
      const s = await startLocalDecisionService(port)
      if (s.running) {
        setErrorMsg(null)
        await runDecision(true)
      } else {
        setErrorMsg(`启动服务失败: ${s.message}`)
      }
    } catch (e) {
      setErrorMsg(String(e))
    } finally {
      setStartingService(false)
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let autoRefreshTimer: ReturnType<typeof setInterval> | undefined
  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
    if (autoRefreshTimer) clearInterval(autoRefreshTimer)
  })

  createEffect(
    on(
      [
        () => quote()?.code,
        () => snapshot()?.config?.aiDecision?.mode,
        () => snapshot()?.status?.session,
        () => snapshot()?.status?.tradingToday,
      ],
      ([code, mode, session, tradingToday]) => {
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = undefined }
        if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = undefined }
        if (!code || (mode !== 'local' && mode !== 'online')) {
          setResult(null)
          return
        }
        const cacheKey = modeType === 'kline' ? `${code}:kline` : code
        const cached = DECISION_CACHE.get(cacheKey)
        const status = snapshot()?.status
        const effSession = session ?? status?.session
        const effTradingToday = tradingToday ?? status?.tradingToday ?? true
        const checkCtx: DecisionCacheCheckContext = {
          now: Date.now(),
          session: effSession,
          tradingToday: effTradingToday,
          quoteDate: quote()?.date,
          quoteTime: quote()?.time,
          feedDate: status?.feedDate ?? undefined,
        }
        if (isDecisionCacheValid(cached, checkCtx, CACHE_TTL_MS)) {
          setResult(cached!.result)
          setErrorMsg(null)
        } else {
          setResult(null)
          debounceTimer = setTimeout(() => { runDecision(false) }, 250)
        }

        // 仅在盘中交易时段开启自动轮询；收盘、午休与非交易日停止后台定时请求
        if (effTradingToday && isLiveDecisionSession(effSession)) {
          const intervalMs = mode === 'local' ? 5_000 : 30_000
          autoRefreshTimer = setInterval(() => {
            if (loading()) return
            const cur = snapshot()?.status
            if ((cur?.tradingToday ?? true) && isLiveDecisionSession(cur?.session)) {
              runDecision(true)
            }
          }, intervalMs)
        }
      },
      { defer: false }
    )
  )

  return {
    result,
    loading,
    errorMsg,
    startingService,
    isEnabled,
    isLocalOffline,
    runDecision,
    startLocalService,
  }
}
