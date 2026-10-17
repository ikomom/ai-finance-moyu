import { createEffect, createSignal, Show } from 'solid-js'
import './Global.css'

import { Chart } from '../components/Chart'
import { FooterControls } from '../components/FooterControls'
import { GlobalStatusBadge } from '../components/GlobalStatusBadge'
import { Grip } from '../components/Grip'
import { KlineCanvas } from '../components/KlineCanvas'
import { PillTabs } from '../components/PillTabs'
import { StatusLine } from '../components/StatusLine'
import { StockHeader } from '../components/StockHeader'
import { useSubchartMode } from '../hooks/useSubchartMode'
import { snapshot } from '../store'
import { fetchGlobalKLine, fetchGlobalTrend } from '../tauri'
import {
  fmtHHMM,
  fmtVol,
  type KLineBar,
  type KLineData,
  type Quote,
  type Trend,
  type TrendPoint,
} from '../types'
import { getGlobalMarketStatus } from '../utils/globalMarket'

// Module-level persistent state across unmount/remount (dock collapse/expand)
const [selectedGlobalIndex, setSelectedGlobalIndex] = createSignal(0)
const [persistedChartTab, setPersistedChartTab] = createSignal<'trend' | 'kline'>('trend')
const [globalKlineMap, setGlobalKlineMap] = createSignal<Record<string, KLineData>>({})
const [globalTrendMap, setGlobalTrendMap] = createSignal<Record<string, Trend>>({})

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

  const [globalKlineLoading, setGlobalKlineLoading] = createSignal(false)
  const [globalTrendLoading, setGlobalTrendLoading] = createSignal(false)

  // Fetch trend on demand
  const loadTrend = (code: string, force = false) => {
    if (!force && globalTrendMap()[code]) return
    setGlobalTrendLoading(true)
    fetchGlobalTrend(code)
      .then((data) => {
        if (data) {
          setGlobalTrendMap((prev) => ({ ...prev, [code]: data }))
        }
      })
      .finally(() => {
        setGlobalTrendLoading(false)
      })
  }

  // Fetch KLine on demand
  const loadKLine = (code: string, force = false) => {
    if (!force && globalKlineMap()[code]) return
    setGlobalKlineLoading(true)
    fetchGlobalKLine(code)
      .then((data) => {
        if (data) {
          setGlobalKlineMap((prev) => ({ ...prev, [code]: data }))
        }
      })
      .finally(() => {
        setGlobalKlineLoading(false)
      })
  }

  // Trigger fetch when current index or mode changes
  createEffect(() => {
    const it = currentIdx()
    if (!it?.code) return
    const mode = activeMode()
    if (mode === 'trend') {
      loadTrend(it.code)
    } else {
      loadKLine(it.code)
    }
  })

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

  const currentCode = () => currentIdx()?.code ?? ''
  const trend = () => globalTrendMap()[currentCode()]
  const kline = () => globalKlineMap()[currentCode()]

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
        {(idx) => {
          const st = () => getGlobalMarketStatus(idx().code)
          return (
            <>
              {/* 指数名称、代码、交易时段状态微标、日内高低、大字价格、作息提示 (复用 StockHeader) */}
              <StockHeader
                name={idx().name}
                code={idx().code}
                price={idx().price}
                changePct={idx().changePct}
                activePrice={activePrice()}
                activePct={activePct()}
                high={stats().high}
                low={stats().low}
                badge={<GlobalStatusBadge status={st()} />}
                hoverTime={hoverTime()}
                hoverExtra={hoverExtra()}
                extraInfo={
                  <span class="hover-time-tag" style={{ opacity: 0.65, 'margin-left': 'auto' }}>
                    {st().hoursText}
                  </span>
                }
              />

              {/* 图表展示区：分时 / 日K */}
              <Show
                when={activeMode() === 'kline'}
                fallback={
                  /* 分时走势图 */
                  <Show
                    when={!globalTrendLoading() && trend()}
                    fallback={
                      <div class="chart-wrap kline-loading-box">
                        <Show
                          when={globalTrendLoading()}
                          fallback={
                            <>
                              <span>⚠️ 暂无分时数据或未在交易时段</span>
                              <button
                                type="button"
                                class="global-retry-btn"
                                onClick={() => loadTrend(idx().code, true)}
                              >
                                重试
                              </button>
                            </>
                          }
                        >
                          <span class="loading-spinner">⌛</span>
                          <span>加载分时数据中…</span>
                        </Show>
                      </div>
                    }
                  >
                    <Chart
                      trend={trend()}
                      preClose={preClose()}
                      lastPrice={idx().price}
                      subchartMode={subchartMode()}
                      compact={false}
                      isGlobal={true}
                      onHover={(point, extra) => {
                        setHoveredPoint(point)
                        setHoveredPointExtra(extra ?? null)
                      }}
                    />
                  </Show>
                }
              >
                {/* 日K走势图 */}
                <Show
                  when={!globalKlineLoading() && kline()}
                  fallback={
                    <div class="chart-wrap kline-loading-box">
                      <Show
                        when={globalKlineLoading()}
                        fallback={
                          <>
                            <span>⚠️ 暂无日K数据</span>
                            <button
                              type="button"
                              class="global-retry-btn"
                              onClick={() => loadKLine(idx().code, true)}
                            >
                              重试
                            </button>
                          </>
                        }
                      >
                        <span class="loading-spinner">⌛</span>
                        <span>加载日K数据中…</span>
                      </Show>
                    </div>
                  }
                >
                  <KlineCanvas
                    kline={kline()}
                    quote={quote()}
                    subchartMode={subchartMode()}
                    onHoverBar={(bar, extra) => {
                      setHoveredKBar(bar)
                      setHoveredKExtra(extra ?? null)
                    }}
                  />
                </Show>
              </Show>

              {/* 底部状态条与副图/走势模式切换胶囊 (复用 FooterControls) */}
              <div class="mini-footer">
                <StatusLine status={s().status} />
                <FooterControls
                  subchartMode={subchartMode()}
                  onToggleSubchart={toggleSubchartMode}
                  viewMode={activeMode()}
                  onToggleView={(m) => {
                    if (m === 'trend' || m === 'kline') setActiveMode(m)
                  }}
                  showSubchart={true}
                  showAuction={false}
                />
              </div>
            </>
          )
        }}
      </Show>

      <Grip />
    </div>
  )
}
