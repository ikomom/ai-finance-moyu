import { Show } from 'solid-js'
import { numOrNull } from './types'
import type { WatchItem } from '../../types'
import { useSettings } from '../settings/SettingsContext'

export interface WatchHoldingSectionProps {
  item: WatchItem
  onUpdate: (patch: Partial<WatchItem>) => void
}

export function WatchHoldingSection(props: WatchHoldingSectionProps) {
  let settings: ReturnType<typeof useSettings> | null = null
  try {
    settings = useSettings()
  } catch {
    // optional fallback if rendered outside SettingsProvider
  }

  const isPortfolio = () => Boolean(settings?.form.enablePortfolio)
  const portfolioPos = () => {
    if (!isPortfolio() || !settings) return null
    return (
      settings.positions().find(
        (p) => p.code.toLowerCase() === props.item.code.toLowerCase() && p.shares > 0
      ) ?? null
    )
  }

  const hasCost = () =>
    !isPortfolio() && (props.item.costPrice != null || props.item.shares != null)

  const handleReset = () => {
    if (isPortfolio()) return
    props.onUpdate({ costPrice: null, shares: null })
  }

  const costValue = () => {
    if (isPortfolio()) {
      const pos = portfolioPos()
      return pos ? pos.costPrice.toFixed(2) : ''
    }
    return props.item.costPrice ?? ''
  }

  const sharesValue = () => {
    if (isPortfolio()) {
      const pos = portfolioPos()
      return pos ? String(pos.shares) : ''
    }
    return props.item.shares ?? ''
  }

  return (
    <div class="drawer-section" classList={{ 'portfolio-locked': isPortfolio() }}>
      <div
        class="drawer-section-title"
        style="display: flex; justify-content: space-between; align-items: center;"
      >
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>持仓与成本</span>
          <Show when={isPortfolio()}>
            <span class="portfolio-managed-badge">🔒 模拟账本托管中</span>
          </Show>
        </div>
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
            disabled={isPortfolio()}
            placeholder={isPortfolio() ? (portfolioPos() ? '' : '未持仓') : '元'}
            value={costValue()}
            onInput={(e) => {
              if (isPortfolio()) return
              props.onUpdate({ costPrice: numOrNull(e.currentTarget.value) })
            }}
          />
        </span>
        <span class="num">
          持仓股数
          <input
            type="number"
            step="100"
            min="0"
            disabled={isPortfolio()}
            placeholder={isPortfolio() ? (portfolioPos() ? '' : '未持仓') : '股'}
            value={sharesValue()}
            onInput={(e) => {
              if (isPortfolio()) return
              props.onUpdate({ shares: numOrNull(e.currentTarget.value) })
            }}
          />
        </span>
      </div>
      <p class="hint" style="margin-top: 4px; font-size: 10.5px; color: var(--text-secondary, #9ca3af);">
        <Show
          when={isPortfolio()}
          fallback="💡 提示：此处用于图表成本线静态标注；未开启模拟账本时由您手动录入。"
        >
          💡 提示：当前已开启模拟账本，该标的持仓与加权成本由买卖交易系统自动核算；若清仓则成本线自动消除；若需调整请在主悬浮窗点击「买卖」或在模拟账本中操作。
        </Show>
      </p>
    </div>
  )
}
