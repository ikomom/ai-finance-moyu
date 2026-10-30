import { createEffect, createSignal, Show } from 'solid-js'
import './Global.css'

import { Grip } from '../components/Grip'
import { PillTabs } from '../components/PillTabs'
import { GlobalDetail } from './GlobalDetail'
import { useSubchartMode } from '../hooks/useSubchartMode'
import { snapshot } from '../store'
import {
  fmtHHMM,
  fmtVol,
  type KLineBar,
  type KlinePeriod,
  type Quote,
  type TrendPoint,
} from '../types'
import { useGlobalChart } from './useGlobalChart'

const STORAGE_KEY_GLOBAL_KLINE_PERIOD = 'global_kline_period'
const getSavedGlobalKlinePeriod = (): KlinePeriod => {
  try {
    const p = localStorage.getItem(STORAGE_KEY_GLOBAL_KLINE_PERIOD) as KlinePeriod
    if (p && ['15m', '30m', '60m', '120m', 'day', 'week'].includes(p)) {
      return p
    }
  } catch {}
  return 'day'
}

// Module-level persistent state across unmount/remount (dock collapse/expand)
const [selectedGlobalIndex, setSelectedGlobalIndex] = createSignal(0)
const [persistedChartTab, setPersistedChartTab] = createSignal<'trend' | 'kline'>('trend')
const [globalKlinePeriod, setGlobalKlinePeriod] = createSignal<KlinePeriod>(getSavedGlobalKlinePeriod())

/**
 * Layout 5 — 全球股指看板 (复用迷你图通用组件架构，具备胶囊切页、大字行情、副图及分时/日K模式).
 */
export function Global(props: { flash: boolean }) {
  const s = () => snapshot()!
  const overview = () => s()?.marketOverview

  const indices = () => overview()?.globalIndices ?? []
  const selectedIndex = () =>
    Math.min(Math.max(0, selectedGlobalIndex()), Math.max(0, indices().length - 1))
  const setSelectedIndex = (i: number) => setSelectedGlobalIndex(i)

  const currentIdx = () => indices()[selectedIndex()] ?? null
  const activeMode = () => persistedChartTab()
  const setActiveMode = (m: 'trend' | 'kline') => setPersistedChartTab(m)

  const handleSelectPeriod = (p: KlinePeriod) => {
    setGlobalKlinePeriod(p)
    try {
      localStorage.setItem(STORAGE_KEY_GLOBAL_KLINE_PERIOD, p)
    } catch {}
  }

  const { subchartMode, setSubchartMode: toggleSubchartMode } = useSubchartMode()

  // Hover states for Trend
  const [hoveredPoint, setHoveredPoint] = createSignal<TrendPoint | null>(null)
  const [hoveredPointExtra, setHoveredPointExtra] = createSignal<{
    minVol: number
    dif?: number
    dea?: number
    macd?: number
  } | null>(null)

  // Hover states for KLine
  const [hoveredKBar, setHoveredKBar] = createSignal<KLineBar | null>(null)
  const [hoveredKExtra, setHoveredKExtra] = createSignal<{
    ma5?: number | null
    ma10?: number | null
    ma20?: number | null
    dif?: number | null
    dea?: number | null
    macd?: number | null
    chgPct?: number | null
  } | null>(null)

  const currentCode = () => currentIdx()?.code ?? ''

  // Lazy per-index trend / K-line loading lives in its own hook.
  const globalChart = useGlobalChart(currentCode, activeMode, globalKlinePeriod)
  const trend = () => globalChart.trend()
  const kline = () => globalChart.kline()


  // Clear hover on index switch
  createEffect(() => {
    selectedIndex()
    setHoveredPoint(null)
    setHoveredPointExtra(null)
    setHoveredKBar(null)
    setHoveredKExtra(null)
  })

  // Mouse wheel cycling
  const handleWheel = (e: WheelEvent) => {
    const list = indices()
    const n = list.length
    if (n <= 1) return
    e.preventDefault()
    if (e.deltaY > 0) {
      setSelectedIndex((selectedIndex() + 1) % n)
    } else if (e.deltaY < 0) {
      setSelectedIndex((selectedIndex() - 1 + n) % n)
    }
  }

  const preClose = () => {
    const it = currentIdx()
    if (!it) return 0
    return it.price - it.change
  }

  const quote = (): Quote | null => {
    const it = currentIdx()
    if (!it) return null
    return {
      code: it.code,
      name: it.name,
      price: it.price,
      preClose: it.price - it.change,
      open: it.price,
      high: it.price,
      low: it.price,
      volume: it.turnover,
      change: it.change,
      changePct: it.changePct,
      date: overview()?.updatedAt ? new Date().toISOString().slice(0, 10).replace(/-/g, '') : '',
      time: overview()?.updatedAt ?? '',
    }
  }

  const stats = () => {
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      if (hk) return { high: hk.high, low: hk.low }
      const bars = kline()?.bars ?? []
      if (bars.length > 0) {
        const lb = bars[bars.length - 1]
        return { high: lb.high, low: lb.low }
      }
    }
    const pts = trend()?.points ?? []
    if (pts.length === 0) {
      const it = currentIdx()
      return { high: it?.price ?? 0, low: it?.price ?? 0 }
    }
    let high = pts[0].price
    let low = pts[0].price
    for (const p of pts) {
      if (p.price > high) high = p.price
      if (p.price > 0 && p.price < low) low = p.price
    }
    return { high, low }
  }

  const activePrice = () => {
    if (activeMode() === 'kline') {
      return hoveredKBar()?.close ?? currentIdx()?.price ?? 0
    }
    return hoveredPoint()?.price ?? currentIdx()?.price ?? 0
  }

  const activePct = () => {
    if (activeMode() === 'kline') {
      if (hoveredKExtra()?.chgPct != null) {
        return hoveredKExtra()!.chgPct!
      }
      return currentIdx()?.changePct ?? 0
    }
    const hp = hoveredPoint()
    if (hp) {
      const pc = preClose()
      return pc > 0 ? ((hp.price - pc) / pc) * 100 : 0
    }
    return currentIdx()?.changePct ?? 0
  }

  const hoverTime = () => {
    if (activeMode() === 'kline') {
      return hoveredKBar()?.date ?? null
    }
    const hp = hoveredPoint()
    return hp ? fmtHHMM(hp.time) : null
  }

  const hoverExtra = () => {
    if (activeMode() === 'kline') {
      const hk = hoveredKBar()
      const ex = hoveredKExtra()
      if (!hk) return null
      if (subchartMode() === 'macd' && ex?.dif != null && ex?.macd != null) {
        return `DIF ${ex.dif.toFixed(2)} · MACD ${ex.macd.toFixed(2)}`
      }
      return `量 ${fmtVol(hk.volume)}`
    }
    const hp = hoveredPoint()
    const hpe = hoveredPointExtra()
    if (!hp || !hpe) return null
    if (subchartMode() === 'macd' && hpe.dif != null && hpe.macd != null) {
      return `DIF ${hpe.dif.toFixed(2)} · MACD ${hpe.macd.toFixed(2)}`
    }
    if (hpe.minVol > 0) {
      return `量 ${fmtVol(hpe.minVol)}`
    }
    return null
  }

  // Everything the detail card needs, passed explicitly so it owns no state.
  const detailProps = {
    quote,
    snapshot: s,
    activePrice,
    activePct,
    stats,
    hoverTime,
    hoverExtra,
    activeMode,
    trend,
    kline,
    preClose,
    loading: globalChart.loading,
    subchartMode,
    klinePeriod: globalKlinePeriod,
    onSelectPeriod: handleSelectPeriod,
    onReloadTrend: () => globalChart.reload(),
    onReloadKline: () => globalChart.reload(),
    onSelectMode: (m: 'trend' | 'kline') => setActiveMode(m),
    onToggleSubchart: () => toggleSubchartMode(subchartMode() === 'macd' ? 'vol' : 'macd'),
    onHoverPoint: (p: TrendPoint | null, extra?: { minVol: number; dif?: number; dea?: number; macd?: number } | null) => {
      setHoveredPoint(p)
      setHoveredPointExtra(extra ?? null)
    },
    onHoverBar: (bar: KLineBar | null, extra?: {
      ma5?: number | null
      ma10?: number | null
      ma20?: number | null
      dif?: number | null
      dea?: number | null
      macd?: number | null
      chgPct?: number | null
    } | null) => {
      setHoveredKBar(bar)
      setHoveredKExtra(extra ?? null)
    },
  }

  return (
    <div
      class="card layout-mini-card layout-global"
      classList={{ flash: props.flash }}
      data-tauri-drag-region
      onWheel={handleWheel}
    >
      {/* 顶部指数 Tab 胶囊栏 (复用 PillTabs) */}
      <Show when={indices().length > 1}>
        <PillTabs
          items={indices().map((it) => ({ id: it.code, label: it.name, title: `${it.name} (${it.code})` }))}
          selectedIndex={selectedIndex()}
          onSelect={setSelectedIndex}
        />
      </Show>

      <Show
        when={currentIdx()}
        fallback={
          <div class="kline-loading-box" style={{ flex: 1 }}>
            <span class="loading-spinner">⌛</span>
            <span>正在拉取全球股指数据…</span>
          </div>
        }
      >
        {(idx) => <GlobalDetail idx={idx} {...detailProps} />}
      </Show>

      <Grip />
    </div>
  )
}
