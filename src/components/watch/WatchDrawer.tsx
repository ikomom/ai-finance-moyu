import { WatchHoldingSection } from './WatchHoldingSection'
import { WatchIndicatorSection } from './WatchIndicatorSection'
import { WatchPriceLinesSection } from './WatchPriceLinesSection'
import type { PriceLine, WatchItem } from '../../types'

export interface WatchDrawerProps {
  item: WatchItem
  onUpdate: (patch: Partial<WatchItem>) => void
  onAddLine: () => void
  onUpdateLine: (lineIndex: number, patch: Partial<PriceLine>) => void
  onRemoveLine: (lineIndex: number) => void
  onToast?: (msg: string, kind?: '' | 'ok' | 'bad') => void
}

export function WatchDrawer(props: WatchDrawerProps) {
  return (
    <div class="watch-drawer">
      {/* 1. 持仓与成本 */}
      <WatchHoldingSection item={props.item} onUpdate={props.onUpdate} />

      {/* 2. 指标策略覆盖 */}
      <WatchIndicatorSection
        item={props.item}
        onUpdate={props.onUpdate}
        onToast={props.onToast}
      />

      {/* 3. 价位线 */}
      <WatchPriceLinesSection
        priceLines={props.item.priceLines}
        onAddLine={props.onAddLine}
        onUpdateLine={props.onUpdateLine}
        onRemoveLine={props.onRemoveLine}
      />
    </div>
  )
}
