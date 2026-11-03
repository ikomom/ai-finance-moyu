import { Show } from 'solid-js'
import type { DragonTigerSeat } from './types'
import type { PairedSeatMeta } from './utils'
import { cleanBranchName, fmtMoney, isSeatHighlighted } from './utils'
import { resolveSeatLabel } from './seatDict'

export interface SeatRowProps {
  idx: number
  seat: DragonTigerSeat
  meta?: PairedSeatMeta
  isBuy: boolean
  highlightBranch?: string
  hoveredPairId: string | null
  onHover: (pairId: string | null) => void
  onClick: () => void
}

export function SeatRow(props: SeatRowProps) {
  const seatTag = () => resolveSeatLabel(props.seat.branch_name, props.seat.trader_label)
  const isHighlighted = () => isSeatHighlighted(props.seat.branch_name, props.highlightBranch, seatTag()?.label)
  const isPairHovered = () => Boolean(props.meta?.pairId && props.hoveredPairId === props.meta?.pairId)

  const tooltip = () => {
    if (props.meta?.isT) {
      const otherSide = props.isBuy ? '卖出榜' : '买入榜'
      const bStr = fmtMoney(props.meta.totalBuy ?? 0, false)
      const sStr = fmtMoney(props.meta.totalSell ?? 0, false)
      const nStr = fmtMoney(props.meta.netAmount, true)
      return `⇄ 与${otherSide}同一主力（日内做T）：买入 +${bStr} | 卖出 -${sStr} | 实际净额 ${nStr}`
    }
    return '点击下钻查看该席位操盘战绩与买卖标的'
  }

  const amtFormatted = () => {
    if (props.isBuy) {
      const v = props.seat.buy_amount > 0 ? props.seat.buy_amount : Math.max(0, props.seat.net_amount)
      return `+${fmtMoney(v, false)}`
    }
    const v = props.seat.sell_amount > 0 ? props.seat.sell_amount : Math.abs(props.seat.net_amount)
    return `-${fmtMoney(v, false)}`
  }

  return (
    <div
      class="lhb-seat-row is-clickable"
      classList={{
        'is-highlighted-seat': Boolean(isHighlighted()),
        'is-paired-hover': isPairHovered(),
      }}
      onMouseEnter={() => props.onHover(props.meta?.pairId || null)}
      onMouseLeave={() => props.onHover(null)}
      onClick={props.onClick}
      title={tooltip()}
    >
      <div class="lhb-seat-left">
        <span class="lhb-seat-rank">{props.idx + 1}</span>
        <span class="lhb-seat-branch">
          {props.meta?.displayName || cleanBranchName(props.seat.branch_name)}
        </span>
        <Show when={props.meta?.isT}>
          <span class="lhb-seat-t-tag" title="该席位当天买卖双向上榜，日内对倒做T">做T ⇄</span>
        </Show>
        <Show when={seatTag()}>
          {(tag) => <span class={`lhb-seat-tag ${tag().category}`}>{tag().label}</span>}
        </Show>
      </div>

      <div class="lhb-seat-right-group">
        <div class={`lhb-seat-main-amt ${props.isBuy ? 'up' : 'down'}`}>
          {amtFormatted()}
          <span class="lhb-seat-arrow">›</span>
        </div>
        <Show when={props.meta?.isT}>
          <div class={`lhb-seat-sub-amt ${props.seat.net_amount >= 0 ? 'up' : 'down'}`}>
            净{fmtMoney(props.seat.net_amount, true)}
          </div>
        </Show>
      </div>
    </div>
  )
}
