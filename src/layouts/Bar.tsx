import { For, Show } from 'solid-js'

import {
  fmtMoney,
  fmtPct,
  fmtPrice,
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
              if (it?.costPrice) {
                parts.push(`成本: ${fmtPrice(it.costPrice)} | 浮盈率: ${fmtPct(profitPct(q.price, it.costPrice))}`)
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
                  <span class={`price ${trendClass(q.changePct)}`}>{fmtPrice(q.price)}</span>
                  <span class={`pct ${trendClass(q.changePct)}`}>{fmtPct(q.changePct)}</span>
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
