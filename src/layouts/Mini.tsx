import { createEffect, createSignal, For, Show } from 'solid-js'

import { AuctionBadge } from '../components/AuctionBadge'
import { AuctionCanvas } from '../components/AuctionCanvas'
import { Chart } from '../components/Chart'
import { Grip } from '../components/Grip'
import { KLineBadge } from '../components/KLineBadge'
import { KlineCanvas } from '../components/KlineCanvas'
import { StatusLine } from '../components/StatusLine'
import { TrendBadge } from '../components/TrendBadge'
import { miniModeOverride, selectedIndex, setMiniModeOverride, setSelected, snapshot } from '../store'
import { fetchKLine, setTrendTargets } from '../tauri'
import {
  fmtHHMM,
  fmtMoney,
  fmtPct,
  fmtPrice,
  isIndexCode,
  profitAmount,
  profitPct,
  resolveIndicatorParams,
  trendClass,
  type AuctionPoint,
  type KLineBar,
  type KLineData,
  type TrendPoint,
} from '../types'

function fmtVol(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}亿`
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`
  return `${Math.round(v)}`
}

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
  const [subchartMode, setSubchartMode] = createSignal<'vol' | 'macd'>(
    (typeof localStorage !== 'undefined' && (localStorage.getItem('moyu_subchart_mode') as 'vol' | 'macd')) || 'vol'
  )
  const toggleSubchartMode = (mode: 'vol' | 'macd') => {
    setSubchartMode(mode)
    try {
      localStorage.setItem('moyu_subchart_mode', mode)
    } catch {}
  }

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
  const isAuctionSession = () =>
    ['CallAuctionCancelable', 'CallAuctionLocked', 'PreTrade'].includes(s()?.status?.session ?? '')
  const activeMode = () => {
    const m = manualMode()
    if (m === 'kline') return 'kline'
    if (m === 'trend') return 'trend'
    if (isIndex()) return 'trend'
    return m ?? (isAuctionSession() ? 'auction' : 'trend')
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

  let tabsContainerRef: HTMLDivElement | undefined
  const tabRefs: (HTMLButtonElement | undefined)[] = []

  const scrollToActiveTab = (idx: number, smooth: boolean = true) => {
    if (!tabsContainerRef) return
    const el = tabRefs[idx]
    if (!el) return

    const containerRect = tabsContainerRef.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()

    if (elRect.left < containerRect.left) {
      const diff = containerRect.left - elRect.left + 8
      tabsContainerRef.scrollBy({
        left: -diff,
        behavior: smooth ? 'smooth' : 'auto',
      })
    } else if (elRect.right > containerRect.right) {
      const diff = elRect.right - containerRect.right + 8
      tabsContainerRef.scrollBy({
        left: diff,
        behavior: smooth ? 'smooth' : 'auto',
      })
    }
  }

  createEffect(() => {
    const idx = selectedIndex()
    setHoveredPoint(null)
    setHoveredAuctionPoint(null)
    quotes()
    requestAnimationFrame(() => {
      scrollToActiveTab(idx, true)
    })
  })

  createEffect(() => {
    const cur = item()
    if (cur?.code) {
      setTrendTargets([cur.code])
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
        <div class="mini-tabs" ref={tabsContainerRef} data-tauri-drag-region>
          <For each={quotes()}>
            {(q, i) => (
              <button
                ref={(el) => (tabRefs[i()] = el)}
                type="button"
                class="mini-tab"
                classList={{ active: i() === selectedIndex() }}
                onClick={() => setSelected(i())}
                title={`${q.name} (${q.code})`}
              >
                {q.name}
              </button>
            )}
          </For>
        </div>
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
        {(q) => {
          const cost = () => item()?.costPrice ?? null
          const shares = () => item()?.shares ?? null
          const pnl = () => profitAmount(q().price, cost(), shares())
          const trend = () => s().trends[q().code]
          const auction = () => s().auctions?.[q().code]

          // High / Low stats from trend points or K-line bar
          const stats = () => {
            if (activeMode() === 'kline') {
              const hk = hoveredKBar()
              if (hk) return { high: hk.high, low: hk.low }
            }
            const pts = trend()?.points ?? []
            if (pts.length === 0) return { high: q().high || q().price, low: q().low || q().price }
            let high = pts[0].price
            let low = pts[0].price
            for (const p of pts) {
              if (p.price > high) high = p.price
              if (p.price > 0 && p.price < low) low = p.price
            }
            return { high, low }
          }

          // Dynamic price & real-time percent when hovering over historical points
          const activePrice = () => {
            if (activeMode() === 'kline') {
              return hoveredKBar()?.close ?? q().price
            }
            if (activeMode() === 'auction') {
              return hoveredAuctionPoint()?.price ?? q().price
            }
            return hoveredPoint()?.price ?? q().price
          }

          const activePct = () => {
            if (activeMode() === 'kline') {
              const hk = hoveredKBar()
              if (hk) {
                return hoveredKExtra()?.chgPct ?? 0
              }
              return q().changePct
            }
            if (activeMode() === 'auction') {
              const ap = hoveredAuctionPoint()
              if (ap && q().preClose > 0) {
                return ((ap.price - q().preClose) / q().preClose) * 100
              }
            } else {
              const hp = hoveredPoint()
              if (hp) {
                const base = q().preClose > 0 ? q().preClose : (q().open > 0 ? q().open : hp.price)
                return base > 0 ? ((hp.price - base) / base) * 100 : 0
              }
            }
            return q().changePct
          }

          const hoverTime = () => {
            if (activeMode() === 'kline') {
              const hk = hoveredKBar()
              return hk ? hk.date : null
            }
            if (activeMode() === 'auction') {
              const ap = hoveredAuctionPoint()
              return ap ? fmtHHMM(ap.time) : null
            }
            const hp = hoveredPoint()
            return hp ? fmtHHMM(hp.time) : null
          }

          const hoverExtra = () => {
            if (activeMode() === 'kline') {
              const hk = hoveredKBar()
              const ex = hoveredKExtra()
              if (!hk) return null
              if (subchartMode() === 'macd' && ex && ex.dif != null && ex.macd != null) {
                return `DIF ${ex.dif.toFixed(2)} · MACD ${ex.macd.toFixed(2)}`
              }
              return `量 ${fmtVol(hk.volume)}手`
            }
            if (activeMode() === 'auction') {
              const ap = hoveredAuctionPoint()
              return ap ? `量 ${Math.round(ap.volume)}手` : null
            }
            const hpe = hoveredPointExtra()
            if (hpe) {
              if (subchartMode() === 'macd' && hpe.dif != null && hpe.macd != null) {
                return `DIF ${hpe.dif.toFixed(2)} · MACD ${hpe.macd.toFixed(2)}`
              }
              if (hpe.minVol > 0) {
                return `量 ${fmtVol(hpe.minVol)}手`
              }
            }
            return null
          }

          return (
            <>
              <div class="mini-meta" data-tauri-drag-region>
                <div class="meta-left">
                  <span class="name">{q().name}</span>
                  <span class="code">{q().code.replace(/^(sh|sz|bj)/, '')}</span>
                  <Show
                    when={activeMode() === 'kline'}
                    fallback={
                      <Show
                        when={activeMode() === 'auction' && !isIndex()}
                        fallback={
                          <Show when={s().config.trendEngine}>
                            <TrendBadge signal={s().trendSignals?.[q().code]} quote={q()} />
                          </Show>
                        }
                      >
                        <AuctionBadge auction={auction()} quote={q()} />
                      </Show>
                    }
                  >
                    <KLineBadge kline={kline()} quote={q()} />
                  </Show>
                </div>
                <div class="meta-right">
                  <div class="stats-text">
                    <span>高 <b class="up">{fmtPrice(stats().high)}</b></span>
                    <span>低 <b class="down">{fmtPrice(stats().low)}</b></span>
                  </div>
                </div>
              </div>

              <div class="mini-price-row">
                <span class={`big-price ${q().price > 0 ? trendClass(activePct()) : 'flat'}`}>
                  {q().price > 0 ? fmtPrice(activePrice()) : '--'}
                </span>
                <span class={`big-pct ${q().price > 0 ? trendClass(activePct()) : 'flat'}`}>
                  {q().price > 0 ? fmtPct(activePct()) : '--'}
                </span>
                <Show when={hoverTime()}>
                  {(time) => (
                    <span class="hover-time-tag">
                      {time()}{hoverExtra() ? ` · ${hoverExtra()}` : ''}
                    </span>
                  )}
                </Show>
                <Show when={!hoverTime()}>
                  <div class="mini-pnl-group">
                    <Show when={cost()}>
                      {(c) => {
                        const pct = profitPct(q().price, c())
                        return pct !== null ? (
                          <span class={`profit-badge ${trendClass(pct)}`}>
                            浮盈 {fmtPct(pct)}
                          </span>
                        ) : null
                      }}
                    </Show>
                    <Show when={pnl() !== null}>
                      <span class={`profit-badge ${trendClass(pnl()!)}`}>
                        {fmtMoney(pnl()!)}
                      </span>
                    </Show>
                  </div>
                </Show>
              </div>

              <Show
                when={activeMode() === 'kline'}
                fallback={
                  <Show
                    when={activeMode() === 'auction'}
                    fallback={
                      <Chart
                        trend={trend()}
                        preClose={q().preClose}
                        costPrice={cost()}
                        priceLines={item()?.priceLines ?? []}
                        lastPrice={q().price}
                        orbHigh={s().trendSignals?.[q().code]?.orbHigh}
                        orbLow={s().trendSignals?.[q().code]?.orbLow}
                        subchartMode={subchartMode()}
                        macdParams={indicatorParams().macd}
                        onHover={(point, extra) => {
                          setHoveredPoint(point)
                          setHoveredPointExtra(extra ?? null)
                        }}
                      />
                    }
                  >
                    <AuctionCanvas
                      auction={auction()}
                      preClose={q().preClose}
                      onHover={setHoveredAuctionPoint}
                    />
                  </Show>
                }
              >
                <KlineCanvas
                  kline={kline()}
                  quote={q()}
                  costPrice={cost()}
                  priceLines={item()?.priceLines ?? []}
                  subchartMode={subchartMode()}
                  maPeriods={indicatorParams().ma}
                  macdParams={indicatorParams().macd}
                  onHoverBar={(bar, extra) => {
                    setHoveredKBar(bar)
                    setHoveredKExtra(extra ?? null)
                  }}
                />
              </Show>

              <div class="mini-footer">
                <StatusLine status={s().status} />
                <div class="mini-footer-actions">
                  <Show when={activeMode() !== 'auction'}>
                    <div class="mode-pill-group">
                      <button
                        type="button"
                        class="mode-pill"
                        classList={{ active: subchartMode() === 'vol' }}
                        onClick={() => toggleSubchartMode('vol')}
                        title="切换副图：成交量 (VOL)"
                      >
                        量
                      </button>
                      <button
                        type="button"
                        class="mode-pill"
                        classList={{ active: subchartMode() === 'macd' }}
                        onClick={() => toggleSubchartMode('macd')}
                        title="切换副图：MACD指标"
                      >
                        MACD
                      </button>
                    </div>
                  </Show>
                  <div class="mode-pill-group">
                    <button
                      type="button"
                      class="mode-pill"
                      classList={{ active: activeMode() === 'trend' }}
                      onClick={() => setManualMode('trend')}
                      title="全天分时图"
                    >
                      分时
                    </button>
                    <button
                      type="button"
                      class="mode-pill"
                      classList={{ active: activeMode() === 'kline' }}
                      onClick={() => setManualMode('kline')}
                      title="前复权日K线及均线系统"
                    >
                      日K
                    </button>
                    <Show when={!isIndex()}>
                      <button
                        type="button"
                        class="mode-pill"
                        classList={{ active: activeMode() === 'auction' }}
                        onClick={() => setManualMode('auction')}
                        title="早盘集合竞价 (09:15-09:25) 走势与诱多/诱空诊断"
                      >
                        竞价
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            </>
          )
        }}
      </Show>
      <Grip />
    </div>
  )
}
