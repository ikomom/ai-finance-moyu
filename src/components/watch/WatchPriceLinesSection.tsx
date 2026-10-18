import { For } from 'solid-js'
import type { PriceLine } from '../../types'

export interface WatchPriceLinesSectionProps {
  priceLines?: PriceLine[]
  onAddLine: () => void
  onUpdateLine: (lineIndex: number, patch: Partial<PriceLine>) => void
  onRemoveLine: (lineIndex: number) => void
}

export function WatchPriceLinesSection(props: WatchPriceLinesSectionProps) {
  return (
    <div class="lines" style="margin-top: 0; padding-top: 0; border-top: none;">
      <div class="lines-head">
        <span>价位线（到价时变色，可弹通知）</span>
        <button type="button" class="ghost" onClick={() => props.onAddLine()}>
          ＋ 加一条
        </button>
      </div>
      <For each={props.priceLines ?? []}>
        {(line, li) => (
          <div class="line-row">
            <input
              class="price"
              type="number"
              step="0.01"
              min="0"
              placeholder="价格"
              value={line.price}
              onInput={(e) =>
                props.onUpdateLine(li(), { price: Number(e.currentTarget.value) })
              }
            />
            <select
              value={line.direction}
              onChange={(e) =>
                props.onUpdateLine(li(), {
                  direction: e.currentTarget.value as PriceLine['direction'],
                })
              }
            >
              <option value="above">上穿</option>
              <option value="below">下穿</option>
            </select>
            <input
              class="label"
              type="text"
              placeholder="备注（可选）"
              value={line.label ?? ''}
              onInput={(e) =>
                props.onUpdateLine(li(), { label: e.currentTarget.value || null })
              }
            />
            <button
              type="button"
              class="icon"
              title="删除这条线"
              onClick={() => props.onRemoveLine(li())}
            >
              ✕
            </button>
          </div>
        )}
      </For>
    </div>
  )
}
