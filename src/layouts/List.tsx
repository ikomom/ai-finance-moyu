import { For, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'

import { Grip } from '../components/Grip'
import { Sparkline } from '../components/Sparkline'
import { StatusLine } from '../components/StatusLine'
import { TrendBadge } from '../components/TrendBadge'
import { selectedIndex, setSelected, snapshot } from '../store'
import {
  fmtMoney,
  fmtPct,
  fmtPrice,
  profitAmount,
  profitPct,
  todayProfitAmount,
  trendClass,
  type WatchItem,
} from '../types'

/**
 * Layout 3 — 自选股列表 (紧凑金融看板).
 * High-density compact table with inline Sparklines and real-time PnL.
 */
export function List(props: { flash: boolean }) {
  const s = () => snapshot()!

  const itemFor = (code: string): WatchItem | undefined =>
    s()?.config.watchlist.find((w) => w.code === code)

  // Aggregate today PnL and total profit if shares are held
  const totalStats = () => {
    const snap = s()
    if (!snap) return null
    let totalToday = 0
    let totalFloating = 0
    let hasShares = false

    for (const q of snap.quotes) {
      const it = itemFor(q.code)
      if (it?.shares && it.shares > 0) {
        hasShares = true
        if (q.preClose > 0) {
          totalToday += (q.price - q.preClose) * it.shares
        }
        if (it.costPrice && it.costPrice > 0) {
          totalFloating += (q.price - it.costPrice) * it.shares
        }
      }
    }

    return hasShares ? { totalToday, totalFloating } : null
  }

  const handleRowDblClick = (e: MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    setSelected(index)
    void invoke('set_layout', { layout: 'mini' })
  }

  return (
    <div class="card layout-list-card" classList={{ flash: props.flash }} data-tauri-drag-region>
      <div class="list-head" data-tauri-drag-region>
        <div class="title-group">
          <span class="title">自选看板</span>
          <span class="count">({s()?.quotes.length ?? 0})</span>
        </div>
        <Show when={totalStats()}>
          {(stats) => (
            <div class="summary-pnl">
              <span class="pnl-item">
                今日: <span class={trendClass(stats().totalToday)}>{fmtMoney(stats().totalToday)}</span>
              </span>
              <span class="pnl-sep">|</span>
              <span class="pnl-item">
                总浮盈: <span class={trendClass(stats().totalFloating)}>{fmtMoney(stats().totalFloating)}</span>
              </span>
            </div>
          )}
        </Show>
      </div>

      <div class="table-container">
        <div class="table-head">
          <span class="col-name">标的</span>
          <span class="col-price">现价</span>
          <span class="col-pct">涨跌幅</span>
          <span class="col-trend">走势</span>
          <span class="col-pnl">盈亏</span>
        </div>

        <div class="table-body">
          <Show
            when={(s()?.quotes.length ?? 0) > 0}
            fallback={<div class="row empty-row">暂无自选股 · 右键添加</div>}
          >
            <For each={s().quotes}>
              {(q, i) => {
                const item = () => itemFor(q.code)
                const cost = () => item()?.costPrice ?? null
                const shares = () => item()?.shares ?? null
                const pnl = () => profitAmount(q.price, cost(), shares())
                const todayPnl = () => todayProfitAmount(q.price, q.preClose, shares())

                return (
                  <div
                    class="table-row"
                    classList={{ active: i() === selectedIndex() }}
                    onClick={() => setSelected(i())}
                    onDblClick={(e) => handleRowDblClick(e, i())}
                    title="双击切换至迷你图深入查看"
                  >
                    <div class="col-name cell-name">
                      <span class="name-text">{q.name}</span>
                      <div class="code-and-signal">
                        <span class="code-text">{q.code.replace(/^(sh|sz|bj)/, '')}</span>
                        <Show when={s().config.trendEngine && s().trendSignals?.[q.code]}>
                          <TrendBadge signal={s().trendSignals[q.code]} compact />
                        </Show>
                      </div>
                    </div>

                    <div class="col-price cell-price">
                      <span class={trendClass(q.changePct)}>{fmtPrice(q.price)}</span>
                    </div>

                    <div class="col-pct cell-pct">
                      <span class={`badge-pct ${trendClass(q.changePct)}`}>
                        {fmtPct(q.changePct)}
                      </span>
                    </div>

                    <div class="col-trend cell-trend">
                      <Sparkline
                        trend={s().trends[q.code]}
                        preClose={q.preClose}
                        lastPrice={q.price}
                      />
                    </div>

                    <div class="col-pnl cell-pnl">
                      <Show
                        when={pnl() !== null}
                        fallback={
                          <Show
                            when={cost()}
                            fallback={<span class="pnl-dash">-</span>}
                          >
                            {(c) => (
                              <span class={`pnl-val ${trendClass(profitPct(q.price, c()))}`}>
                                {fmtPct(profitPct(q.price, c()))}
                              </span>
                            )}
                          </Show>
                        }
                      >
                        <div class="pnl-stack">
                          <span class={`pnl-val ${trendClass(pnl()!)}`}>
                            {fmtMoney(pnl()!)}
                          </span>
                          <Show when={todayPnl() !== null}>
                            <span class={`pnl-sub ${trendClass(todayPnl()!)}`}>
                              日 {fmtMoney(todayPnl()!)}
                            </span>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </div>
                )
              }}
            </For>
          </Show>
        </div>
      </div>

      <StatusLine status={s().status} />
      <Grip />
    </div>
  )
}
