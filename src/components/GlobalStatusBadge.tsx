import { Show } from 'solid-js'
import { getGlobalMarketStatus, type MarketStatus } from '../utils/globalMarket'
import './GlobalStatusBadge.css'

export interface GlobalStatusBadgeProps {
  code?: string
  status?: MarketStatus | null
  class?: string
}

/**
 * 全球股指时段状态彩色圆点徽标 (交易中/盘前/午休/已收盘/周末休市).
 */
export function GlobalStatusBadge(props: GlobalStatusBadgeProps) {
  const currentStatus = () => {
    if (props.status) return props.status
    if (props.code) return getGlobalMarketStatus(props.code)
    return null
  }

  return (
    <Show when={currentStatus()}>
      {(st) => (
        <span
          class={`global-status-badge ${st().badgeClass} ${props.class ?? ''}`}
          title={`${st().label} (${st().hoursText})`}
        >
          <span class="status-dot" />
          {st().label}
        </span>
      )}
    </Show>
  )
}
