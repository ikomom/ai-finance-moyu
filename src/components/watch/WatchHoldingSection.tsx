import { Show } from 'solid-js'
import { numOrNull } from './types'
import type { WatchItem } from '../../types'

export interface WatchHoldingSectionProps {
  item: WatchItem
  onUpdate: (patch: Partial<WatchItem>) => void
}

export function WatchHoldingSection(props: WatchHoldingSectionProps) {
  const hasCost = () => props.item.costPrice != null || props.item.shares != null

  const handleReset = () => {
    props.onUpdate({ costPrice: null, shares: null })
  }

  return (
    <div class="drawer-section">
      <div class="drawer-section-title" style="display: flex; justify-content: space-between; align-items: center;">
        <span>持仓与成本</span>
        <Show when={hasCost()}>
          <button
            type="button"
            class="ghost"
            style="font-size: 10.5px; padding: 1px 6px; color: #f87171;"
            onClick={handleReset}
            title="清空此标的的成本价与持仓股数"
          >
            重置成本
          </button>
        </Show>
      </div>
      <div class="drawer-row">
        <span class="num">
          成本价
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="元"
            value={props.item.costPrice ?? ''}
            onInput={(e) =>
              props.onUpdate({ costPrice: numOrNull(e.currentTarget.value) })
            }
          />
        </span>
        <span class="num">
          持仓股数
          <input
            type="number"
            step="100"
            min="0"
            placeholder="股"
            value={props.item.shares ?? ''}
            onInput={(e) =>
              props.onUpdate({ shares: numOrNull(e.currentTarget.value) })
            }
          />
        </span>
      </div>
      <p class="hint" style="margin-top: 4px; font-size: 10.5px; color: var(--text-secondary, #9ca3af);">
        💡 提示：此处用于图表成本线静态标注；如已启用「模拟账本」，通过模拟买卖交易将自动联动更新此成本。
      </p>
    </div>
  )
}
