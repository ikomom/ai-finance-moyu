import { createEffect, createSignal, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import './Mini.css'

import { getSavedTrendSubmode, STORAGE_KEY_TREND_SUBMODE } from '../components/FooterControls'
import { Grip } from '../components/Grip'
import { MiniBody, type MiniMode } from './MiniBody'
import { MiniEmpty } from './MiniEmpty'
import { PillTabs } from '../components/PillTabs'
import { GroupDropdown } from '../components/watch/GroupDropdown'
import { useHistoryDrill } from './useHistoryDrill'
import { useSubchartMode } from '../hooks/useSubchartMode'
import { ALL_GROUP_ID, filterQuotesByGroup, filterWatchlistByGroup } from '../services/watchlistGroups'
import { miniModeOverride, selectedIndex, setMiniModeOverride, setSelected, snapshot } from '../store'
import { fetchAvailableHistoryDates, fetchKLine, fetchMultiDayTrend, setTrendTargets } from '../tauri'
import {
  isIndexCode,
  resolveIndicatorParams,
  type AuctionPoint,
  type KLineBar,
  type KLineData,
  type KlinePeriod,
  type MultiDayTrend,
  type TrendPoint,
} from '../types'

/**
 * Layout 2 — 迷你图.
 * Fast pill tabs, mouse wheel stock cycling, hover crosshair display & intraday high/low stats.
 */
export function Mini(props: { flash: boolean }) {
  const s = () => snapshot()!
  const [hoveredPoint, setHoveredPoint] = createSignal<TrendPoint | null>(null)
  const [hoveredPointExtra, setHoveredPointExtra] = createSignal<{ minVol: number; dif?: number; dea?: number; macd?: number } | null>(null)
  const [hoveredAuctionPoint, setHoveredAuctionPoint] = createSignal<AuctionPoint | null>(null)
  const [hoveredKBar, setHoveredKBar] = createSignal<KLineBar | null>(null)
  const [hoveredKExtra, setHoveredKExtra] = createSignal<{ ma5?: number | null; ma10?: number | null; ma20?: number | null; dif?: number | null; dea?: number | null; macd?: number | null; chgPct?: number | null } | null>(null)
  const [manualMode, setManualMode] = createSignal<MiniMode | null>(
    getSavedTrendSubmode() === 'five_day' ? 'five_day' : null
  )

  createEffect(() => {
    const override = miniModeOverride()
    if (override) {
      drill.clearHistoryDrill()
      setManualMode(override)
      setMiniModeOverride(null)
    }
  })

  const STORAGE_KEY_KLINE_PERIOD = 'kline_period'
  const getSavedKlinePeriod = (): KlinePeriod => {
    try {
      const p = localStorage.getItem(STORAGE_KEY_KLINE_PERIOD) as KlinePeriod
      if (p && ['15m', '30m', '60m', '120m', 'day', 'week'].includes(p)) return p
    } catch {}
    return 'day'
  }

  const [klineCache, setKlineCache] = createSignal<Record<string, KLineData | null>>({})
  const [klineLoading, setKlineLoading] = createSignal(false)
  const [klinePeriod, setKlinePeriod] = createSignal<KlinePeriod>(getSavedKlinePeriod())
  const [multiTrendCache, setMultiTrendCache] = createSignal<Record<string, MultiDayTrend | null>>({})
  const [multiTrendLoading, setMultiTrendLoading] = createSignal(false)
  const [diskDatesCache, setDiskDatesCache] = createSignal<Record<string, string[]>>({})
  const { subchartMode, setSubchartMode: toggleSubchartMode } = useSubchartMode()

  const handleSelectPeriod = (p: KlinePeriod) => {
    drill.clearHistoryDrill()
    setKlinePeriod(p)
    try { localStorage.setItem(STORAGE_KEY_KLINE_PERIOD, p) } catch {}
  }

  const activeGroupId = () => s()?.config.activeGroupId ?? ALL_GROUP_ID
  const watchlist = () => filterWatchlistByGroup(s()?.config.watchlist ?? [], activeGroupId())
  const quotes = () => filterQuotesByGroup(s()?.quotes ?? [], s()?.config.watchlist ?? [], activeGroupId())
  const item = () => {
    const list = watchlist()
    return list[selectedIndex()] ?? list[0]
  }

  createEffect(() => {
    const n = quotes().length
    if (n > 0 && selectedIndex() >= n) setSelected(0)
  })

  const indicatorParams = () => resolveIndicatorParams(item(), s()?.config?.indicatorConfig)
  const quote = () => {
    const it = item()
    return it ? quotes().find((q) => q.code === it.code) : undefined
  }

  const kline = () => {
    const c = quote()?.code
    const k = c ? `${c}:${klinePeriod()}` : undefined
    const d = k ? klineCache()[k] : undefined
    return d ?? undefined
  }

  const isIndex = () => isIndexCode(quote()?.code ?? '')
  const activeMode = () => {
    const m = manualMode()
    if (m === 'kline' || m === 'five_day' || m === 'trend') return m
    return getSavedTrendSubmode() === 'five_day' ? 'five_day' : 'trend'
  }

  const clearHover = () => {
    setHoveredPoint(null); setHoveredPointExtra(null); setHoveredAuctionPoint(null); setHoveredKBar(null); setHoveredKExtra(null)
  }

  const allDrillableDates = () => {
    const c = quote()?.code
    if (!c) return []
    const mem = multiTrendCache()[c]?.days.map((d) => d.date.replace(/-/g, '').slice(0, 8)) ?? []
    const disk = (diskDatesCache()[c] ?? []).map((d) => d.replace(/-/g, '').slice(0, 8))
    return Array.from(new Set([...mem, ...disk])).sort()
  }

  const drill = useHistoryDrill({
    quoteCode: () => quote()?.code,
    multiTrendCache,
    allDrillableDates,
    setManualMode,
    onClearHover: () => { setHoveredPoint(null); setHoveredPointExtra(null) },
  })

  // Load disk archived dates on security switch with negative caching
  createEffect(() => {
    const code = quote()?.code
    if (code && !(code in diskDatesCache())) {
      void fetchAvailableHistoryDates(code).then((dates) => {
        setDiskDatesCache((prev) => ({ ...prev, [code]: dates ?? [] }))
      })
    }
  })

  // Lazy-load 5-day trend data on demand (for five_day view or kline drill-down)
  createEffect(() => {
    const code = quote()?.code
    const mode = activeMode()
    if ((mode === 'five_day' || mode === 'kline') && code && !(code in multiTrendCache()) && !multiTrendLoading()) {
      setMultiTrendLoading(true)
      fetchMultiDayTrend(code)
        .then((data) => {
          setMultiTrendCache((prev) => ({ ...prev, [code]: data ?? null }))
        })
        .finally(() => setMultiTrendLoading(false))
    }
  })

  // Lazy-load candlestick data on demand
  createEffect(() => {
    const code = quote()?.code
    const mode = activeMode()
    const period = klinePeriod()
    const key = code ? `${code}:${period}` : ''
    if (mode === 'kline' && code && key && !(key in klineCache()) && !klineLoading()) {
      setKlineLoading(true)
      fetchKLine(code, period)
        .then((data) => {
          setKlineCache((prev) => ({ ...prev, [key]: data ?? null }))
        })
        .finally(() => setKlineLoading(false))
    }
  })

  createEffect(() => {
    selectedIndex()
    clearHover()
  })

  let lastTrendTarget = ''
  createEffect(() => {
    const code = item()?.code
    if (code && code !== lastTrendTarget) {
      lastTrendTarget = code
      setTrendTargets([code])
    }
  })

  const handleWheel = (e: WheelEvent) => {
    if (drill.historyDrillDay()) {
      e.preventDefault(); e.stopPropagation()
      drill.stepHistoryDay(e.deltaY > 0 ? 1 : -1)
      return
    }
    const n = quotes().length
    if (n <= 1) return
    e.preventDefault()
    if (e.deltaY > 0) setSelected((selectedIndex() + 1) % n)
    else if (e.deltaY < 0) setSelected((selectedIndex() - 1 + n) % n)
  }

  return (
    <div
      class="card layout-mini-card"
      classList={{ flash: props.flash }}
      data-tauri-drag-region
      onWheel={handleWheel}
      onPointerDown={drill.handleSideButton}
      onAuxClick={drill.handleSideButton}
      onContextMenu={(e) => {
        e.preventDefault(); e.stopPropagation()
        const c = quote()?.code
        void invoke('show_context_menu', c ? { code: c } : {})
      }}
    >
      <PillTabs
        prefix={<GroupDropdown />}
        items={quotes().map((q) => ({ id: q.code, label: q.name, title: `${q.name} (${q.code})` }))}
        selectedIndex={selectedIndex()}
        onSelect={setSelected}
        onItemContextMenu={(tabItem) => {
          void invoke('show_context_menu', { code: String(tabItem.id) })
        }}
      />

      <Show when={quote()} fallback={<MiniEmpty item={item()} status={s().status} />}>
        {(q) => (
          <MiniBody
            quote={q}
            item={item}
            snapshot={s}
            activeMode={activeMode}
            isIndex={isIndex}
            kline={kline}
            indicatorParams={indicatorParams}
            subchartMode={subchartMode}
            onToggleSubchart={() => toggleSubchartMode(subchartMode() === 'macd' ? 'vol' : 'macd')}
            onSelectMode={(m) => {
              drill.clearHistoryDrill()
              if (m === 'five_day' || m === 'trend') {
                try { localStorage.setItem(STORAGE_KEY_TREND_SUBMODE, m) } catch {}
              }
              setManualMode(m)
            }}
            klinePeriod={klinePeriod}
            onSelectPeriod={handleSelectPeriod}
            multiDayTrend={() => {
              const c = q().code
              const d = c ? multiTrendCache()[c] : undefined
              return d ?? undefined
            }}
            drillableDates={allDrillableDates}
            historyDrillDay={drill.historyDrillDay}
            drillOrigin={drill.drillOrigin}
            hasPrevHistoryDay={drill.hasPrevHistoryDay}
            hasNextHistoryDay={drill.hasNextHistoryDay}
            onPrevHistoryDay={() => drill.stepHistoryDay(-1)}
            onNextHistoryDay={() => drill.stepHistoryDay(1)}
            onSelectDay={(day, origin = 'five_day') => drill.enterHistoryDrill(day, origin)}
            onExitHistoryDrill={drill.exitHistoryDrill}
            hover={{
              point: hoveredPoint,
              setPoint: setHoveredPoint,
              pointExtra: hoveredPointExtra,
              setPointExtra: setHoveredPointExtra,
              auctionPoint: hoveredAuctionPoint,
              setAuctionPoint: setHoveredAuctionPoint,
              kbar: hoveredKBar,
              setKbar: setHoveredKBar,
              kbarExtra: hoveredKExtra,
              setKbarExtra: setHoveredKExtra,
            }}
          />
        )}
      </Show>
      <Grip />
    </div>
  )
}
