import { For, onMount, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'

import { setTrendTargets } from '../tauri'
import {
  ALL_GROUP_ID,
  filterQuotesByGroup,
  filterWatchlistByGroup,
} from '../services/watchlistGroups'
import { diagnoseIndex } from '../utils/indexDiagnosis'
import { diagnoseStock } from '../utils/stockDiagnosis'
import './Bar.css'
import {
  fmtMoney,
  fmtPct,
  fmtPrice,
  isIndexCode,
  profitAmount,
  profitPct,
  todayProfitAmount,
  trendClass,
  type Snapshot,
} from '../types'

/**
 * Layout 1 — 数字条 (横向胶囊形态).
 * Single horizontal line, sleek frosted-glass pill, horizontal scroll on wheel.
 */
export function Bar(props: { snapshot: Snapshot; flash: boolean }) {
  onMount(() => {
    setTrendTargets([])
  })

  const activeGroupId = () => props.snapshot.config.activeGroupId ?? ALL_GROUP_ID
  const filteredWatchlist = () => filterWatchlistByGroup(props.snapshot.config.watchlist, activeGroupId())
  const filteredQuotes = () => filterQuotesByGroup(props.snapshot.quotes, props.snapshot.config.watchlist, activeGroupId())

  const itemFor = (code: string) =>
    filteredWatchlist().find((w) => w.code === code)

  const handleWheel = (e: WheelEvent) => {
    // Enable horizontal scroll with mouse wheel
    const el = e.currentTarget as HTMLElement | null
    if (el && e.deltaY) {
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
  }

  return (
    <div
      class="layout-bar"
      classList={{ flash: props.flash }}
      data-tauri-drag-region
      onWheel={handleWheel}
    >
      <Show
        when={filteredQuotes().length > 0}
        fallback={<div class="bar-item muted">该分组暂无自选股 · 右键设置</div>}
      >
        <For each={filteredQuotes()}>
          {(q, i) => {
            const item = () => itemFor(q.code)
            const pnlMoney = () =>
              profitAmount(q.price, item()?.costPrice, item()?.shares)
            const todayMoney = () =>
              todayProfitAmount(q.price, q.preClose, item()?.shares)

            const tooltip = () => {
              const it = item()
              const parts = [`${q.name} (${q.code})`, `现价: ${fmtPrice(q.price)} (${fmtPct(q.changePct)})`]
              if (isIndexCode(q.code)) {
                const diag = diagnoseIndex(q, props.snapshot.marketOverview, props.snapshot.trendSignals?.[q.code])
                parts.push(`大盘诊断: ${diag.badgeLabel} · ${diag.guidance}`)
                parts.push(`盘面实况: ${diag.summary}`)
                parts.push(`两市成交: ${diag.totalTurnoverText} (${diag.turnoverDeltaDetail}) | 涨 ${diag.upCount} 跌 ${diag.downCount}`)
              } else if (props.snapshot.config.trendEngine) {
                const sig = props.snapshot.trendSignals?.[q.code]
                if (sig) {
                  const sdiag = diagnoseStock(q, sig)
                  parts.push(`个股诊断: ${sdiag.badgeLabel} · ${sdiag.guidance}`)
                  parts.push(`实战指引: ${sdiag.actionSummary}`)
                  parts.push(`资金量价: ${sdiag.vwapStatusText} | 盘口 ${sdiag.imbalanceText} | 主买 ${sdiag.activeBuyText}`)
                  if (sig.sectorLinkage) {
                    const lk = sig.sectorLinkage
                    const leaderText = lk.leaderName ? ` (龙头: ${lk.leaderName} ${lk.leaderChangePct >= 0 ? '+' : ''}${lk.leaderChangePct.toFixed(2)}%)` : ''
                    parts.push(`板块联动: ${lk.sectorName} ${lk.sectorChangePct >= 0 ? '+' : ''}${lk.sectorChangePct.toFixed(2)}%${leaderText} | [${lk.role}] 超额: ${lk.deltaRSector >= 0 ? '+' : ''}${lk.deltaRSector.toFixed(2)}%`)
                  }
                  parts.push(`多空能量: ${sdiag.scoreLabel}`)
                }
              }
              if (it?.costPrice != null) {
                const pct = profitPct(q.price, it.costPrice)
                if (pct !== null) {
                  parts.push(`成本: ${fmtPrice(it.costPrice)} | 浮盈率: ${fmtPct(pct)}`)
                } else {
                  parts.push(`成本: ${fmtPrice(it.costPrice)}`)
                }
              }
              if (it?.shares) {
                parts.push(`持仓: ${it.shares}股`)
                const td = todayMoney()
                if (td != null) parts.push(`今日盈亏: ${fmtMoney(td)}`)
                const pf = pnlMoney()
                if (pf != null) parts.push(`累计盈亏: ${fmtMoney(pf)}`)
              }
              return parts.join('\n')
            }

            return (
              <>
                <Show when={i() > 0}>
                  <span class="bar-sep">/</span>
                </Show>
                <div
                  class="bar-item"
                  title={tooltip()}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    void invoke('show_context_menu', { code: q.code })
                  }}
                >
                  <span class="name">{q.name}</span>
                  <span class={`price ${q.price > 0 ? trendClass(q.changePct) : 'flat'}`}>
                    {q.price > 0 ? fmtPrice(q.price) : '--'}
                  </span>
                  <span class={`pct ${q.price > 0 ? trendClass(q.changePct) : 'flat'}`}>
                    {q.price > 0 ? fmtPct(q.changePct) : '--'}
                  </span>
                  <Show when={todayMoney() != null}>
                    <span class={`money ${trendClass(todayMoney()!)}`}>
                      {fmtMoney(todayMoney()!)}
                    </span>
                  </Show>
                </div>
              </>
            )
          }}
        </For>
      </Show>
    </div>
  )
}
