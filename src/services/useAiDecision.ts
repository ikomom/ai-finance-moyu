//! Reactive composable for System-1 AI Decision Engine.
//!
//! Follows AGENTS.md §11 (isolated feature module, <=300 lines).

import { createSignal, createEffect, on, untrack, onCleanup, type Accessor } from 'solid-js'
import { decideStockWithAi, startLocalDecisionService } from './aiDecision'
import { diagnoseStock } from '../utils/stockDiagnosis'
import type { Quote, Snapshot, KLineData } from '../types'
import type { StockDecisionPayload, StockDecisionResult } from '../types/aiDecision'

const DECISION_CACHE = new Map<string, { result: StockDecisionResult; ts: number }>()
const IN_FLIGHT_REQUESTS = new Map<string, Promise<StockDecisionResult>>()
const CACHE_TTL_MS = 30_000

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
        setResult(res)
        setErrorMsg(null)
      } catch (e) {
        setErrorMsg(String(e))
      }
      return
    }

    const now = Date.now()
    if (!force) {
      const cached = DECISION_CACHE.get(cacheKey)
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        setResult(cached.result)
        setErrorMsg(null)
        return
      }
    }

    setLoading(true)
    setErrorMsg(null)

    const signal = snap?.trendSignals?.[code]
    const diag = diagnoseStock(q, signal)

    // 核心特征提取：支撑阻力距离、波段大趋势、大盘剪刀差
    const bars = kd?.bars
    const lastBar = bars && bars.length > 0 ? bars[bars.length - 1] : null
    const support = kd?.support ?? null
    const resistance = kd?.resistance ?? null
    const ma5 = lastBar?.ma5 ?? null
    const ma20 = lastBar?.ma20 ?? null
    const curPrice = q.price > 0 ? q.price : (lastBar?.close ?? 0)

    const supportDistPct =
      support && support > 0 && curPrice > 0 ? ((curPrice - support) / support) * 100 : null
    const resistDistPct =
      resistance && resistance > 0 && curPrice > 0 ? ((resistance - curPrice) / curPrice) * 100 : null
    const ma20DistPct =
      ma20 && ma20 > 0 && curPrice > 0 ? ((curPrice - ma20) / ma20) * 100 : null

    let waveTrend = '波段整理'
    if (ma20 && curPrice > 0) {
      if (curPrice >= ma20 * 0.99) {
        waveTrend = ma5 && curPrice < ma5 ? '波段多头回踩' : '波段多头向上'
      } else if (support && curPrice >= support * 0.99) {
        waveTrend = '波段箱体震荡'
      } else {
        waveTrend = '波段空头通道'
      }
    }

    let marketScissorsPct: number | null = null
    const indices = snap?.marketOverview?.indices
    if (indices && indices.length > 0) {
      const chinext = indices.find((i) => i.code === '399006' || i.name.includes('创业板'))
      const sh = indices.find((i) => i.code === '000001' || i.name.includes('上证'))
      if (chinext && sh) {
        marketScissorsPct = chinext.changePct - sh.changePct
      }
    }

    const payload: StockDecisionPayload = {
      code,
      name: q.name || code,
      price: curPrice,
      changePct: q.changePct,
      vwapBias: signal?.biasPct ?? 0,
      activeBuyRatio: q.activeBuyRatio ?? null,
      bidAskImbalance: q.bidAskImbalance ?? null,
      spatialDesc: diag.spatialText,
      sectorDesc: `${diag.sectorText} (${diag.sectorRoleText})`,
      sectorStyle: diag.sectorRoleText,
      dailyMaDesc: ma5 && ma20 ? `MA5: ${ma5.toFixed(2)}, MA20: ${ma20.toFixed(2)}` : undefined,
      dailyKdjDesc: kd?.kdjStatus ?? (lastBar?.j != null ? `J值: ${lastBar.j.toFixed(0)}` : undefined),
      dailyLevelsDesc: support && resistance ? `支撑: ${support.toFixed(2)}, 阻力: ${resistance.toFixed(2)}` : undefined,
      supportDistPct,
      resistDistPct,
      ma20DistPct,
      waveTrend,
      marketScissorsPct,
      modeType,
    }

    const promise = decideStockWithAi(payload)
    IN_FLIGHT_REQUESTS.set(cacheKey, promise)

    try {
      const res = await promise
      if (quote()?.code === code) {
        setResult(res)
        DECISION_CACHE.set(cacheKey, { result: res, ts: Date.now() })
      }
    } catch (e) {
      if (quote()?.code === code) {
        setErrorMsg(String(e))
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
      [() => quote()?.code, () => snapshot()?.config?.aiDecision?.mode],
      ([code, mode]) => {
        if (debounceTimer) clearTimeout(debounceTimer)
        if (autoRefreshTimer) {
          clearInterval(autoRefreshTimer)
          autoRefreshTimer = undefined
        }
        if (!code || (mode !== 'local' && mode !== 'online')) {
          setResult(null)
          return
        }
        const cacheKey = modeType === 'kline' ? `${code}:kline` : code
        const cached = DECISION_CACHE.get(cacheKey)
        if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
          setResult(cached.result)
          setErrorMsg(null)
        } else {
          debounceTimer = setTimeout(() => {
            runDecision(false)
          }, 250)
        }

        // 持续看盘自动研判轮询：本地量化极速 (6ms) 每 5 秒刷新，线上大模型每 30 秒刷新
        const intervalMs = mode === 'local' ? 5_000 : 30_000
        autoRefreshTimer = setInterval(() => {
          if (loading()) return
          runDecision(true)
        }, intervalMs)
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
