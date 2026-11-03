import { Show } from 'solid-js'
import type { SeatRadarItem } from './types'
import { fmtPct, fmtPrice, trendClass } from '../../types'
import { cleanBranchName, fmtMoney } from './utils'
import { resolveSeatLabel } from './seatDict'

export interface SeatRadarCardProps {
  item: SeatRadarItem
  onOpenDrawer?: (code: string, name: string, highlightBranch: string) => void
}

export function SeatRadarCard(props: SeatRadarCardProps) {
  const item = props.item
  const seatTag = () => resolveSeatLabel(item.branch_name, item.trader_label)

  return (
    <div
      class="seat-result-card"
      onClick={() =>
        props.onOpenDrawer?.(item.code, item.name || item.code, item.branch_name)
      }
      title={`点击查看 ${item.name || item.code} 龙虎榜席位详情（高亮该营业部）`}
    >
      <div class="seat-res-top">
        <div class="seat-res-stock">
          <span class="seat-res-name">{item.name || item.code}</span>
          <span class="seat-res-code">{item.code}</span>
        </div>
        <div class="seat-res-quote">
          <span class={`seat-res-price ${trendClass(item.change_pct)}`}>
            {fmtPrice(item.close_price, 2)}
          </span>
          <span class={`seat-res-pct ${trendClass(item.change_pct)}`}>
            {fmtPct(item.change_pct)}
          </span>
        </div>
      </div>

      <div class="seat-res-bottom">
        <div class="seat-hit-badge" title={item.branch_name}>
          <Show when={seatTag()}>
            {(tag) => <span class="seat-trader-tag">{tag().label}</span>}
          </Show>
          <span class="seat-branch-text">{cleanBranchName(item.branch_name)}</span>
        </div>
        <div class={`seat-action-val ${item.is_buy ? 'buy' : 'sell'}`}>
          <span>{item.is_buy ? '买入' : '卖出'}</span>
          <span>
            {item.is_buy
              ? `+${fmtMoney(item.buy_amount, false)}`
              : `-${fmtMoney(item.sell_amount, false)}`}
          </span>
        </div>
      </div>
    </div>
  )
}
