import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { PendingOrder } from '../../types/portfolio'
import './PendingOrdersPopover.css'

export interface PendingOrdersPopoverProps {
  orders: PendingOrder[]
  onCancel: (orderId: string) => void
  onCancelAll?: () => void
  disabled?: boolean
}

export function PendingOrdersPopover(props: PendingOrdersPopoverProps) {
  const [open, setOpen] = createSignal(false)
  let containerRef: HTMLDivElement | undefined

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false)
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside)
  })

  onCleanup(() => {
    document.removeEventListener('click', handleClickOutside)
  })

  return (
    <Show when={props.orders.length > 0}>
      <div class="pending-popover-container" ref={containerRef}>
        <button
          type="button"
          class="pending-pill-trigger"
          classList={{ active: open() }}
          onClick={() => setOpen(!open())}
        >
          <span class="pending-pill-dot" />
          <span class="pending-pill-text">挂单: {props.orders.length}笔</span>
          <svg
            class={`pending-pill-arrow ${open() ? 'open' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            width="10"
            height="10"
          >
            <path
              fill-rule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>

        <Show when={open()}>
          <div class="pending-dropdown-popover">
            <div class="pending-popover-header">
              <span class="pending-header-title">排队挂单 ({props.orders.length})</span>
              <Show
                when={(props.orders.length > 1) && props.onCancelAll}
                fallback={<span class="pending-header-tip">触及自动撮合</span>}
              >
                <button
                  type="button"
                  class="pending-cancel-all-btn"
                  disabled={props.disabled}
                  onClick={() => props.onCancelAll!()}
                  title="撤销当前标的全部排队挂单"
                >
                  全部撤单
                </button>
              </Show>
            </div>
            <div class="pending-popover-list">
              <For each={props.orders}>
                {(order) => {
                  const isBuy = () => order.action === 'Buy'
                  return (
                    <div class="pending-popover-item">
                      <span class={`pending-badge ${isBuy() ? 'buy' : 'sell'}`}>
                        {isBuy() ? '买' : '卖'}
                      </span>
                      <span class="pending-item-name" title={`${order.name} (${order.code})`}>
                        {order.name || order.code}
                      </span>
                      <span class="pending-item-price">¥{order.price.toFixed(2)}</span>
                      <span class="pending-item-shares">{order.shares}股</span>
                      <button
                        type="button"
                        class="pending-cancel-btn"
                        disabled={props.disabled}
                        onClick={() => props.onCancel(order.id)}
                        title="撤销该挂单并立即解冻资金/持仓"
                      >
                        撤单
                      </button>
                    </div>
                  )
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
