import { createEffect, createSignal, Show } from 'solid-js'
import './Mini.css'

import { Grip } from '../components/Grip'
import { MiniBody } from './MiniBody'
import { PillTabs } from '../components/PillTabs'
import { StatusLine } from '../components/StatusLine'
import { useSubchartMode } from '../hooks/useSubchartMode'
import { miniModeOverride, selectedIndex, setMiniModeOverride, setSelected, snapshot } from '../store'
import { fetchKLine, setTrendTargets } from '../tauri'
import {
  isIndexCode,
  resolveIndicatorParams,
  type AuctionPoint,
  type KLineBar,
  type KLineData,
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

  const [klineCache, setKlineCache] = createSignal<Record<string, KLineData>>({})
  const [klineLoading, setKlineLoading] = createSignal(false)
  const { subchartMode, setSubchartMode: toggleSubchartMode } = useSubchartMode()

  const quotes = () => s()?.quotes ?? []
  const item = () => {
    const list = s()?.config.watchlist ?? []
    return list[selectedIndex()] ?? list[0]
  }

  const indicatorParams = () => resolveIndicatorParams(item(), s()?.config?.indicatorConfig)

  const quote = () => {
    const it = item()
    return it ? quotes().find((q) => q.code === it.code) : undefined
  }

  const kline = () => {
    const c = quote()?.code
    return c ? klineCache()[c] : undefined
  }

  const isIndex = () => isIndexCode(quote()?.code ?? '')

  const activeMode = () => {
    const m = manualMode()
    if (m === 'kline') return 'kline'
    if (m === 'trend') return 'trend'
    if (isIndex()) return 'trend'
    return 'trend'
  }

  // Lazy-load daily candlestick data on demand
  createEffect(() => {
    const code = quote()?.code
    const mode = activeMode()
    if (mode === 'kline' && code && !klineCache()[code] && !klineLoading()) {
      setKlineLoading(true)
      fetchKLine(code)
        .then((data) => {
          if (data) {
            setKlineCache((prev) => ({ ...prev, [code]: data }))
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
    >
      {/* Top stock pill tabs */}
      <Show when={quotes().length > 1}>
        <PillTabs
          items={quotes().map((q) => ({ id: q.code, label: q.name, title: `${q.name} (${q.code})` }))}
          selectedIndex={selectedIndex()}
          onSelect={setSelected}
        />
      </Show>

      <Show
        when={quote()}
        fallback={
          <>
            <div class="card-head">
              <span class="name">{item()?.code ?? '暂无自选股'}</span>
            </div>
            <div class="card-head" style={{ opacity: 0.5 }}>
              等待行情…
            </div>
            <StatusLine status={s().status} />
          </>
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
