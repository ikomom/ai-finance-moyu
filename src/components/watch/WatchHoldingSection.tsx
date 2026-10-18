import { numOrNull } from './types'
import type { WatchItem } from '../../types'

export interface WatchHoldingSectionProps {
  item: WatchItem
  onUpdate: (patch: Partial<WatchItem>) => void
}

export function WatchHoldingSection(props: WatchHoldingSectionProps) {
  return (
    <div class="drawer-section">
      <div class="drawer-section-title">持仓与成本</div>
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
    </div>
  )
}
