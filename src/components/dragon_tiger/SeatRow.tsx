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
  maxAmt?: number
  highlightBranch?: string
  hoveredPairId: string | null
  onHover: (pairId: string | null) => void
  onClick: () => void
}

export function SeatRow(props: SeatRowProps) {
  const seatTag = () => resolveSeatLabel(props.seat.branch_name, props.seat.trader_label)
  const isHighlighted = () => isSeatHighlighted(props.seat.branch_name, props.highlightBranch, seatTag()?.label)
  const isPairHovered = () => Boolean(props.meta?.pairId && props.hoveredPairId === props.meta?.pairId)

  // Primary amount (买方看买入，卖方看卖出)
  const primaryVal = () =>
    props.isBuy
      ? props.seat.buy_amount > 0
        ? props.seat.buy_amount
        : Math.max(0, props.seat.net_amount)
      : props.seat.sell_amount > 0
      ? props.seat.sell_amount
      : Math.abs(props.seat.net_amount)

  // Secondary amount (买方看卖出，卖方看买入)
  const secondaryVal = () => (props.isBuy ? props.seat.sell_amount : props.seat.buy_amount)

  // Relative proportion bar width
  const barPercent = () => {
    const max = props.maxAmt ?? 0
    if (max <= 0) return 0
    return Math.min(100, Math.max(0, (primaryVal() / max) * 100))
  }

  const tooltip = () => {
    const primaryLabel = props.isBuy ? '买入' : '卖出'
    const secondaryLabel = props.isBuy ? '卖出' : '买入'
    const pStr = fmtMoney(primaryVal(), false)
    const sStr = secondaryVal() > 0 ? fmtMoney(secondaryVal(), false) : '0'
    const nStr = fmtMoney(props.seat.net_amount, true)

    if (props.meta?.isT) {
      return `⇄ 买卖对倒做T：${primaryLabel} ${pStr} | ${secondaryLabel} ${sStr} | 席位净额 ${nStr}（点击下钻）`
    }
    return `${props.seat.branch_name}\n${primaryLabel} ${pStr} | ${secondaryLabel} ${sStr} | 净额 ${nStr}\n点击下钻查看操盘战绩`
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
      {/* Background proportion bar aligned with numbers on the right */}
      <div
        class={`lhb-seat-bar-bg ${props.isBuy ? 'buy' : 'sell'}`}
        style={{ width: `${barPercent().toFixed(1)}%` }}
      />

      <div class="lhb-seat-left">
        <span class="lhb-seat-rank">{props.idx + 1}</span>
        <span class="lhb-seat-branch" title={props.seat.branch_name}>
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
          {fmtMoney(primaryVal(), false)}
          <span class="lhb-seat-arrow">›</span>
        </div>
        <div class={`lhb-seat-sub-amt ${props.isBuy ? 'down' : 'up'}`}>
          {secondaryVal() > 0 ? fmtMoney(secondaryVal(), false) : '--'}
        </div>
      </div>
    </div>
  )
}
