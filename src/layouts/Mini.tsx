import { createEffect, createSignal, For, Show } from 'solid-js'

import { Chart } from '../components/Chart'
import { Grip } from '../components/Grip'
import { StatusLine } from '../components/StatusLine'
import { selectedIndex, setSelected, snapshot } from '../store'
import {
  fmtHHMM,
  fmtMoney,
  fmtPct,
  fmtPrice,
  profitAmount,
  profitPct,
  trendClass,
  type TrendPoint,
} from '../types'

/**
 * Layout 2 — 迷你图.
 * Fast pill tabs, mouse wheel stock cycling, hover crosshair display & intraday high/low stats.
 */
export function Mini(props: { flash: boolean }) {
  const s = () => snapshot()!
  const [hoveredPoint, setHoveredPoint] = createSignal<TrendPoint | null>(null)

  const quotes = () => s()?.quotes ?? []
  const item = () => {
    const list = s()?.config.watchlist ?? []
    return list[selectedIndex()] ?? list[0]
  }

  const quote = () => {
    const it = item()
    return it ? quotes().find((q) => q.code === it.code) : undefined
  }

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
    quotes()
    requestAnimationFrame(() => {
      scrollToActiveTab(idx, true)
    })
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

          // High / Low stats from trend points
          const stats = () => {
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

          return (
            <>
              <div class="mini-meta" data-tauri-drag-region>
                <div class="meta-left">
                  <span class="name">{q().name}</span>
                  <span class="code">{q().code.replace(/^(sh|sz|bj)/, '')}</span>
                </div>
                <div class="meta-right">
                  <Show
                    when={hoveredPoint()}
                    fallback={
                      <div class="stats-text">
                        <span>高 <b class="up">{fmtPrice(stats().high)}</b></span>
                        <span>低 <b class="down">{fmtPrice(stats().low)}</b></span>
                      </div>
                    }
                  >
                    {(hp) => {
                      const chg = hp().price - q().preClose
                      const pct = q().preClose > 0 ? (chg / q().preClose) * 100 : 0
                      return (
                        <div class="hover-text">
                          <span class="hover-time">{fmtHHMM(hp().time)}</span>
                          <span class={`hover-price ${trendClass(pct)}`}>
                            {fmtPrice(hp().price)} ({fmtPct(pct)})
                          </span>
                        </div>
                      )
                    }}
                  </Show>
                </div>
              </div>

              <div class="mini-price-row">
                <span class={`big-price ${trendClass(q().changePct)}`}>
                  {fmtPrice(q().price)}
                </span>
                <span class={`big-pct ${trendClass(q().changePct)}`}>
                  {fmtPct(q().changePct)}
                </span>
                <div class="mini-pnl-group">
                  <Show when={cost()}>
                    {(c) => (
                      <span class={`profit-badge ${trendClass(profitPct(q().price, c()))}`}>
                        浮盈 {fmtPct(profitPct(q().price, c()))}
                      </span>
                    )}
                  </Show>
                  <Show when={pnl() !== null}>
                    <span class={`profit-badge ${trendClass(pnl()!)}`}>
                      {fmtMoney(pnl()!)}
                    </span>
                  </Show>
                </div>
              </div>

              <Chart
                trend={trend()}
                preClose={q().preClose}
                costPrice={cost()}
                priceLines={item()?.priceLines ?? []}
                lastPrice={q().price}
                onHover={setHoveredPoint}
              />

              <StatusLine status={s().status} />
            </>
          )
        }}
      </Show>
      <Grip />
    </div>
  )
}
