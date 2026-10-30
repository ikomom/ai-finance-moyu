//! On-demand loaders for the global-index layout.
//!
//! The layout fetches a per-index trend or daily K-line lazily and caches it in
//! a signal map. Kept in its own hook so `Global.tsx` stays a view file
//! (AGENTS.md §11 colocation guidance).

import { createEffect, createSignal, type Accessor } from 'solid-js'

import { fetchGlobalKLine, fetchGlobalTrend } from '../tauri'
import type { KlinePeriod, KLineData, Trend } from '../types'

type ChartMode = 'trend' | 'kline'

export interface GlobalChartCache {
  trend: Accessor<Trend | undefined>
  kline: Accessor<KLineData | undefined>
  loading: Accessor<boolean>
  reload: () => void
}

/**
 * Lazily fetch the chart data for whichever index/code is currently selected,
 * and re-fetch when the mode, selection, or K-line period changes.
 */
export function useGlobalChart(
  currentCode: Accessor<string>,
  mode: Accessor<ChartMode>,
  period: Accessor<KlinePeriod>
): GlobalChartCache {
  const [trendMap, setTrendMap] = createSignal<Record<string, Trend>>({})
  const [klineMap, setKlineMap] = createSignal<Record<string, KLineData>>({})
  const [klineLoading, setKlineLoading] = createSignal(false)
  const [trendLoading, setTrendLoading] = createSignal(false)

  const loadTrend = (code: string, force = false) => {
    if (!force && trendMap()[code]) return
    setTrendLoading(true)
    fetchGlobalTrend(code)
      .then((data) => {
        if (data) setTrendMap((prev) => ({ ...prev, [code]: data }))
      })
      .finally(() => setTrendLoading(false))
  }

  const loadKLine = (code: string, p: KlinePeriod, force = false) => {
    const key = `${code}:${p}`
    if (!force && klineMap()[key]) return
    setKlineLoading(true)
    fetchGlobalKLine(code, p)
      .then((data) => {
        if (data) setKlineMap((prev) => ({ ...prev, [key]: data }))
      })
      .finally(() => setKlineLoading(false))
  }

  createEffect(() => {
    const code = currentCode()
    if (!code) return
    if (mode() === 'trend') {
      loadTrend(code)
    } else {
      loadKLine(code, period())
    }
  })

  return {
    trend: () => trendMap()[currentCode()],
    kline: () => klineMap()[`${currentCode()}:${period()}`],
    loading: () => (mode() === 'trend' ? trendLoading() : klineLoading()),
    reload: () => {
      const code = currentCode()
      if (!code) return
      if (mode() === 'trend') loadTrend(code, true)
      else loadKLine(code, period(), true)
    },
  }
}
