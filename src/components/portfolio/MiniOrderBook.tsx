import { For, Show } from 'solid-js'
import './MiniOrderBook.css'
import { trendClass } from '../../types'
import type { PendingOrder } from '../../types/portfolio'

export interface MiniOrderBookProps {
  bids?: [number, number][]
  asks?: [number, number][]
  preClose?: number
  currentPrice?: number
  pendingOrders?: PendingOrder[]
  onPickPrice?: (price: number) => void
}

function fmtOrderVol(vol: number): string {
  if (vol <= 0) return '-'
  if (vol >= 10000) return `${(vol / 10000).toFixed(1)}万`
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}k`
  return Math.round(vol).toString()
}

export function MiniOrderBook(props: MiniOrderBookProps) {
  const maxVol = () => {
    let m = 1
    for (const b of props.bids ?? []) {
      if (b[1] > m) m = b[1]
    }
    for (const a of props.asks ?? []) {
      if (a[1] > m) m = a[1]
    }
    return m
  }

  const matchOrder = (p: number) => {
    if (p <= 0 || !props.pendingOrders || props.pendingOrders.length === 0) return undefined
    const matched = props.pendingOrders.filter((o) => Math.abs(o.price - p) < 0.001)
    if (matched.length === 0) return undefined
    const totalShares = matched.reduce((sum, o) => sum + o.shares, 0)
    const isBuy = matched[0].action === 'Buy'
    return {
      action: matched[0].action,
      totalShares,
      title: `我的${isBuy ? '买单' : '卖单'}: ${totalShares}股 (¥${p.toFixed(2)})`,
    }
  }

  // 卖盘从卖5倒序到卖1 (上方卖5，紧贴中间的是卖1)
  const askTiers = () => {
    const list = props.asks ?? []
    const tiers = ['卖5', '卖4', '卖3', '卖2', '卖1']
    return tiers.map((label, idx) => {
      const askIdx = 4 - idx // 0对应卖5(list[4]), 4对应卖1(list[0])
      const tuple = list[askIdx]
      const price = tuple ? tuple[0] : 0
      return {
        label,
        price,
        vol: tuple ? tuple[1] : 0,
        order: matchOrder(price),
      }
    })
  }

  // 买盘从买1到买5 (紧贴中间的是买1，下方买5)
  const bidTiers = () => {
    const list = props.bids ?? []
    const tiers = ['买1', '买2', '买3', '买4', '买5']
    return tiers.map((label, idx) => {
      const tuple = list[idx]
      const price = tuple ? tuple[0] : 0
      return {
        label,
        price,
        vol: tuple ? tuple[1] : 0,
        order: matchOrder(price),
      }
    })
  }

  const handleRowClick = (price: number) => {
    if (price > 0 && props.onPickPrice) {
      props.onPickPrice(price)
    }
  }

  return (
    <div class="mini-order-book" title="五档盘口：点击任意档位价格可直接带入委托价">
      <div class="ob-section asks">
        <For each={askTiers()}>
          {(tier) => {
            const pct = () => (tier.vol > 0 ? Math.min(100, Math.round((tier.vol / maxVol()) * 100)) : 0)
            const diff = () => (tier.price > 0 && props.preClose ? tier.price - props.preClose : 0)
            return (
              <div
                class="ob-row ask-row"
                classList={{ clickable: tier.price > 0, 'has-order': !!tier.order }}
                onClick={() => handleRowClick(tier.price)}
                title={tier.order ? `${tier.order.title} · 点击带入委托价` : undefined}
              >
                <div class="ob-depth-bar ask-bar" style={{ width: `${pct()}%` }} />
                <span class="ob-tier-label">
                  {tier.label}
                  <Show when={tier.order}>
                    <span class={`ob-order-dot ${tier.order!.action === 'Buy' ? 'buy' : 'sell'}`} />
                  </Show>
                </span>
                <span class={`ob-price ${tier.price > 0 ? trendClass(diff()) : ''}`}>
                  {tier.price > 0 ? tier.price.toFixed(2) : '--'}
                </span>
                <span class="ob-vol">{fmtOrderVol(tier.vol)}</span>
              </div>
            )
          }}
        </For>
      </div>

      <div class="ob-divider" />

      <div class="ob-section bids">
        <For each={bidTiers()}>
          {(tier) => {
            const pct = () => (tier.vol > 0 ? Math.min(100, Math.round((tier.vol / maxVol()) * 100)) : 0)
            const diff = () => (tier.price > 0 && props.preClose ? tier.price - props.preClose : 0)
            return (
              <div
                class="ob-row bid-row"
                classList={{ clickable: tier.price > 0, 'has-order': !!tier.order }}
                onClick={() => handleRowClick(tier.price)}
                title={tier.order ? `${tier.order.title} · 点击带入委托价` : undefined}
              >
                <div class="ob-depth-bar bid-bar" style={{ width: `${pct()}%` }} />
                <span class="ob-tier-label">
                  {tier.label}
                  <Show when={tier.order}>
                    <span class={`ob-order-dot ${tier.order!.action === 'Buy' ? 'buy' : 'sell'}`} />
                  </Show>
                </span>
                <span class={`ob-price ${tier.price > 0 ? trendClass(diff()) : ''}`}>
                  {tier.price > 0 ? tier.price.toFixed(2) : '--'}
                </span>
                <span class="ob-vol">{fmtOrderVol(tier.vol)}</span>
              </div>
            )
          }}
        </For>
      </div>
    </div>
  )
}
