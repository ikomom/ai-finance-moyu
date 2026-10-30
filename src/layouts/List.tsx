import { For, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import './List.css'

import { Grip } from '../components/Grip'
import { IndexBadge } from '../components/IndexBadge'
import { Sparkline } from '../components/Sparkline'
import { StatusLine } from '../components/StatusLine'
import { StockBadge } from '../components/StockBadge'
import { GroupDropdown } from '../components/watch/GroupDropdown'
import {
  ALL_GROUP_ID,
  filterQuotesByGroup,
  filterWatchlistByGroup,
} from '../services/watchlistGroups'
import { selectedIndex, setSelected, snapshot } from '../store'
import {
  fmtMoney,
  fmtPct,
  fmtPrice,
  isIndexCode,
  profitAmount,
  profitPct,
  todayProfitAmount,
  trendClass,
  type WatchItem,
} from '../types'
import { computeTotalStats, useListScroll } from './useListScroll'

/**
 * Layout 3 — 自选股列表 (紧凑金融看板).
 * High-density compact table with inline Sparklines and real-time PnL.
 */
export function List(props: { flash: boolean }) {
  const s = () => snapshot()!
  let tableBodyRef: HTMLDivElement | undefined

  const activeGroupId = () => s()?.config.activeGroupId ?? ALL_GROUP_ID
  const filteredWatchlist = () => filterWatchlistByGroup(s()?.config.watchlist ?? [], activeGroupId())
  const filteredQuotes = () => filterQuotesByGroup(s()?.quotes ?? [], s()?.config.watchlist ?? [], activeGroupId())

  const { handleScroll } = useListScroll(
    () => filteredQuotes(),
    () => tableBodyRef
  )

  const itemFor = (code: string): WatchItem | undefined =>
    filteredWatchlist().find((w) => w.code === code)

  const totalStats = () => computeTotalStats(filteredQuotes(), filteredWatchlist())

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
          <GroupDropdown />
          <span class="count">({filteredQuotes().length})</span>
        </div>
        <Show when={totalStats()}>
          {(stats) => (
            <div
              class="summary-pnl"
              title={`今日: ${fmtMoney(stats().totalToday)} | 总浮盈: ${fmtMoney(stats().totalFloating)}${stats().floatingPct !== null ? ` (${fmtPct(stats().floatingPct!)})` : ''}`}
            >
              <span class="pnl-item">
                日 <span class={trendClass(stats().totalToday)}>{fmtMoney(stats().totalToday)}</span>
              </span>
              <span class="pnl-sep">|</span>
              <span class="pnl-item">
                总 <span class={trendClass(stats().totalFloating)}>{fmtMoney(stats().totalFloating)}</span>
                <Show when={stats().floatingPct !== null}>
                  <span class={`pnl-sub-pct ${trendClass(stats().floatingPct!)}`}>
                    {' '}({fmtPct(stats().floatingPct!)})
                  </span>
                </Show>
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

        <div class="table-body" ref={tableBodyRef} onScroll={handleScroll}>
          <Show
            when={filteredQuotes().length > 0}
            fallback={<div class="row empty-row">该分组暂无自选股 · 右键添加</div>}
          >
            <For each={filteredQuotes()}>
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
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void invoke('show_context_menu', { code: q.code })
                    }}
                    title="双击切换至迷你图深入查看 · 右键管理"
                  >
                    <div class="col-name cell-name">
                      <span class="name-text">{q.name}</span>
                      <div class="code-and-signal">
                        <span class="code-text">{q.code.replace(/^(sh|sz|bj)/, '')}</span>
                        <Show
                          when={isIndexCode(q.code)}
                          fallback={
                            <Show when={s().config.trendEngine && s().trendSignals?.[q.code]}>
                              <StockBadge signal={s().trendSignals[q.code]} quote={q} compact />
                            </Show>
                          }
                        >
                          <IndexBadge compact quote={q} overview={s().marketOverview} signal={s().trendSignals?.[q.code]} />
                        </Show>
                      </div>
                    </div>
                    <div class="col-price cell-price">
                      <span class={q.price > 0 ? trendClass(q.changePct) : 'flat'}>
                        {q.price > 0 ? fmtPrice(q.price) : '--'}
                      </span>
                    </div>
                    <div class="col-pct cell-pct">
                      <span class={`badge-pct ${q.price > 0 ? trendClass(q.changePct) : 'flat'}`}>
                        {q.price > 0 ? fmtPct(q.changePct) : '--'}
                      </span>
                    </div>
                    <div class="col-trend cell-trend">
                      <Sparkline
                        trend={s().trends[q.code]}
                        preClose={q.preClose}
                        lastPrice={q.price}
                      />
                    </div>
                    <div
                      class="col-pnl cell-pnl"
                      title={
                        pnl() !== null
                          ? `总盈亏: ${fmtMoney(pnl()!)} (${cost() && profitPct(q.price, cost()!) !== null ? fmtPct(profitPct(q.price, cost()!)!) : '--'})${todayPnl() !== null ? ` | 今日盈亏: ${fmtMoney(todayPnl()!)}` : ''}`
                          : cost() && profitPct(q.price, cost()!) !== null
                            ? `浮盈: ${fmtPct(profitPct(q.price, cost()!)!)}`
                            : undefined
                      }
                    >
                      <Show
                        when={pnl() !== null}
                        fallback={
                          <Show
                            when={cost()}
                            fallback={<span class="pnl-dash">-</span>}
                          >
                            {(c) => {
                              const p = profitPct(q.price, c())
                              return p !== null ? (
                                <span class={`pnl-val ${trendClass(p)}`}>
                                  {fmtPct(p)}
                                </span>
                              ) : (
                                <span class="pnl-val flat">--</span>
                              )
                            }}
                          </Show>
                        }
                      >
                        <div class="pnl-stack">
                          <span class={`pnl-val ${trendClass(pnl()!)}`}>
                            {fmtMoney(pnl()!)}
                          </span>
                          <div class="pnl-sub-row">
                            <Show when={cost() && profitPct(q.price, cost()!) !== null}>
                              <span class={`pnl-pct ${trendClass(profitPct(q.price, cost()!)!)}`}>
                                {fmtPct(profitPct(q.price, cost()!)!)}
                              </span>
                            </Show>
                            <Show when={todayPnl() !== null}>
                              <span class={`pnl-sub ${trendClass(todayPnl()!)}`}>
                                <Show when={cost() && profitPct(q.price, cost()!) !== null}>
                                  {' · '}
                                </Show>
                                日 {fmtMoney(todayPnl()!)}
                              </span>
                            </Show>
                          </div>
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
