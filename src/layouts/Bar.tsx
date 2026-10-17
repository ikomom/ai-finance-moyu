import { For, onMount, Show } from 'solid-js'

import { setTrendTargets } from '../tauri'
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

  const itemFor = (code: string) =>
    props.snapshot.config.watchlist.find((w) => w.code === code)

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
        when={props.snapshot.quotes.length > 0}
        fallback={<div class="bar-item muted">暂无自选股 · 右键设置</div>}
      >
        <For each={props.snapshot.quotes}>
          {(q, i) => {
            const item = () => itemFor(q.code)
            const pnlMoney = () =>
              profitAmount(q.price, item()?.costPrice, item()?.shares)
            const todayMoney = () =>
              todayProfitAmount(q.price, q.preClose, item()?.shares)

            const tooltip = () => {
              const it = item()
              const parts = [`${q.name} (${q.code})`, `现价: ${fmtPrice(q.price)} (${fmtPct(q.changePct)})`]
              if (props.snapshot.config.trendEngine) {
                const sig = props.snapshot.trendSignals?.[q.code]
                if (sig) {
                  parts.push(`形态诊断: ${sig.label} (评分 ${sig.score > 0 ? '+' : ''}${sig.score})`)
                  parts.push(`均线偏离: ${sig.biasPct >= 0 ? '+' : ''}${sig.biasPct.toFixed(2)}% | ${sig.summary}`)
                  if (!isIndexCode(q.code) && sig.sectorLinkage) {
                    const lk = sig.sectorLinkage
                    const leaderText = lk.leaderName ? ` (龙头: ${lk.leaderName} ${lk.leaderChangePct >= 0 ? '+' : ''}${lk.leaderChangePct.toFixed(2)}%)` : ''
                    parts.push(`板块联动: ${lk.sectorName} ${lk.sectorChangePct >= 0 ? '+' : ''}${lk.sectorChangePct.toFixed(2)}%${leaderText} | [${lk.role}] 超额: ${lk.deltaRSector >= 0 ? '+' : ''}${lk.deltaRSector.toFixed(2)}%`)
                  }
                  if (q.bidAskImbalance != null && q.bidAskImbalance !== 0) {
                    parts.push(`微观盘口: 买卖失衡 ${(q.bidAskImbalance * 100).toFixed(1)}% | 主买占比 ${((q.activeBuyRatio ?? 0.5) * 100).toFixed(1)}%`)
                  }
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
                <div class="bar-item" title={tooltip()}>
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
