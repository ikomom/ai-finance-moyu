import { createEffect, createSignal, Show } from 'solid-js'
import './DragonTigerBadge.css'
import { fetchStockDragonTiger } from '../../tauri'

export interface DragonTigerBadgeProps {
  code: string
  onClick?: () => void
}

/** Check if trade_date is a recent trading day (within last 3 calendar days). */
function isRecentTradingDay(tradeDate: string): boolean {
  if (!tradeDate) return false
  const d = new Date(tradeDate + 'T00:00:00+08:00')
  if (isNaN(d.getTime())) return false
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  // Allow up to 4 calendar days (covers Friday→Monday + holidays buffer)
  return diffMs >= 0 && diffMs < 4 * 24 * 60 * 60 * 1000
}

export function DragonTigerBadge(props: DragonTigerBadgeProps) {
  const [hasLhb, setHasLhb] = createSignal(false)
  let lastFetchedCode = ''

  createEffect(() => {
    const code = props.code
    if (!code || code === lastFetchedCode) return
    lastFetchedCode = code
    void fetchStockDragonTiger(code).then((detail) => {
      const dt = detail?.dragon_tiger
      setHasLhb(Boolean(dt && isRecentTradingDay(dt.trade_date)))
    })
  })

  return (
    <Show when={hasLhb()}>
      <button
        type="button"
        class="lhb-badge is-lhb"
        onClick={(e) => {
          e.stopPropagation()
          props.onClick?.()
        }}
        title="该股近期披露龙虎榜席位数据，点击查看"
      >
        <span class="icon">🐉</span>
        <span>龙虎</span>
      </button>
    </Show>
  )
}
