import { createEffect, createSignal, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import './Mini.css'

import { Grip } from '../components/Grip'
import { MiniBody } from './MiniBody'
import { PillTabs } from '../components/PillTabs'
import { StatusLine } from '../components/StatusLine'
import { GroupDropdown } from '../components/watch/GroupDropdown'
import { useSubchartMode } from '../hooks/useSubchartMode'
import {
  ALL_GROUP_ID,
  filterQuotesByGroup,
  filterWatchlistByGroup,
} from '../services/watchlistGroups'
import { miniModeOverride, selectedIndex, setMiniModeOverride, setSelected, snapshot } from '../store'
import { fetchKLine, setTrendTargets } from '../tauri'
import {
  isIndexCode,
  resolveIndicatorParams,
  type AuctionPoint,
  type KLineBar,
  type KLineData,
  type KlinePeriod,
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
  const [manualMode, setManualMode] = createSignal<'trend' | 'kline' | 'auction' | null>(null)

  createEffect(() => {
    const override = miniModeOverride()
    if (override) {
      setManualMode(override)
      setMiniModeOverride(null)
    }
  })

  const STORAGE_KEY_KLINE_PERIOD = 'kline_period'
  const getSavedKlinePeriod = (): KlinePeriod => {
    try {
      const p = localStorage.getItem(STORAGE_KEY_KLINE_PERIOD) as KlinePeriod
      if (p && ['15m', '30m', '60m', '120m', 'day', 'week'].includes(p)) {
        return p
      }
    } catch {}
    return 'day'
  }

  const [klineCache, setKlineCache] = createSignal<Record<string, KLineData>>({})
  const [klineLoading, setKlineLoading] = createSignal(false)
  const [klinePeriod, setKlinePeriod] = createSignal<KlinePeriod>(getSavedKlinePeriod())
  const { subchartMode, setSubchartMode: toggleSubchartMode } = useSubchartMode()

  const handleSelectPeriod = (p: KlinePeriod) => {
    setKlinePeriod(p)
    try {
      localStorage.setItem(STORAGE_KEY_KLINE_PERIOD, p)
    } catch {}
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
    if (n > 0 && selectedIndex() >= n) {
      setSelected(0)
    }
  })

  const indicatorParams = () => resolveIndicatorParams(item(), s()?.config?.indicatorConfig)

  const quote = () => {
    const it = item()
    return it ? quotes().find((q) => q.code === it.code) : undefined
  }

  const kline = () => {
    const c = quote()?.code
    const k = c ? `${c}:${klinePeriod()}` : undefined
    return k ? klineCache()[k] : undefined
  }

  const isIndex = () => isIndexCode(quote()?.code ?? '')

  const activeMode = () => {
    const m = manualMode()
    if (m === 'kline') return 'kline'
    if (m === 'trend') return 'trend'
    if (isIndex()) return 'trend'
    return 'trend'
  }

  // Lazy-load candlestick data on demand
  createEffect(() => {
    const code = quote()?.code
    const mode = activeMode()
    const period = klinePeriod()
    const key = code ? `${code}:${period}` : ''
    if (mode === 'kline' && code && key && !klineCache()[key] && !klineLoading()) {
      setKlineLoading(true)
      fetchKLine(code, period)
        .then((data) => {
          if (data) {
            setKlineCache((prev) => ({ ...prev, [key]: data }))
          }
        })
        .finally(() => {
          setKlineLoading(false)
        })
    }
  })

  // Clear hover state on item switch
  createEffect(() => {
    selectedIndex()
    setHoveredPoint(null)
    setHoveredAuctionPoint(null)
    setHoveredKBar(null)
    setHoveredKExtra(null)
  })

  // Only report when the *code* changes: `item()` returns a fresh object on
  // every snapshot, so an unguarded effect fired an IPC call every poll tick.
  let lastTrendTarget = ''
  createEffect(() => {
    const code = item()?.code
    if (code && code !== lastTrendTarget) {
      lastTrendTarget = code
      setTrendTargets([code])
    }
  })

  const handleWheel = (e: WheelEvent) => {
    const n = quotes().length
    if (n <= 1) return
    e.preventDefault()
    if (e.deltaY > 0) {
      setSelected((selectedIndex() + 1) % n)
    } else if (e.deltaY < 0) {
      setSelected((selectedIndex() - 1 + n) % n)
    }
  }

  return (
    <div
      class="card layout-mini-card"
      classList={{ flash: props.flash }}
      data-tauri-drag-region
      onWheel={handleWheel}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const c = quote()?.code
        void invoke('show_context_menu', c ? { code: c } : {})
      }}
    >
      {/* Top stock pill tabs with GroupDropdown prefix */}
      <PillTabs
        prefix={<GroupDropdown />}
        items={quotes().map((q) => ({ id: q.code, label: q.name, title: `${q.name} (${q.code})` }))}
        selectedIndex={selectedIndex()}
        onSelect={setSelected}
        onItemContextMenu={(tabItem) => {
          void invoke('show_context_menu', { code: String(tabItem.id) })
        }}
      />

      <Show
        when={quote()}
        fallback={
          <div class="mini-empty">
            <div class="mini-empty-main">
              <Show
                when={item()}
                fallback={
                  <>
                    <svg class="mini-empty-art" viewBox="0 0 56 34" aria-hidden="true">
                      <polyline
                        points="1,27 12,19 21,23 31,11 41,16 55,5"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                      <line x1="1" y1="31" x2="55" y2="31" stroke="currentColor" stroke-width="1" opacity="0.3" />
                      <circle cx="31" cy="11" r="2.2" fill="currentColor" opacity="0.65" />
                    </svg>
                    <span class="mini-empty-title">这个分组还没有股票</span>
                    <span class="mini-empty-hint">右键添加，或直接搜一只加进来</span>
                    <button
                      type="button"
                      class="mini-empty-add"
                      onClick={(e) => {
                        e.stopPropagation()
                        void emit('open-quick-add-modal')
                      }}
                    >
                      ＋ 添加自选
                    </button>
                  </>
                }
              >
                <span class="mini-empty-title">{item()?.code}</span>
                <span class="mini-empty-hint">正在等待这只股票的行情…</span>
              </Show>
            </div>
            <StatusLine status={s().status} />
          </div>
        }
      >
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
            onSelectMode={(m) => setManualMode(m)}
            klinePeriod={klinePeriod}
            onSelectPeriod={handleSelectPeriod}
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
