import { Show } from 'solid-js'
import type { TradeAction } from '../../types/portfolio'
import { formatSharesDisplay } from './tradeHelpers'

export interface TradeFormFieldsProps {
  action: TradeAction
  onActionChange: (action: TradeAction) => void
  price: number
  onPriceChange: (price: number) => void
  currentPrice: number
  shares: number
  onSharesChange: (shares: number) => void
  availSellShares: number
  onRatioClick: (ratio: number) => void
  onFirstLotClick: () => void
  depthHint: { vol: number; ratio: number; isExceeded: boolean } | null
}

export function TradeFormFields(props: TradeFormFieldsProps) {
  return (
    <>
      {/* Direction Tabs */}
      <div class="mini-trade-direction-bar">
        <button
          type="button"
          class={`direction-tab buy ${props.action === 'Buy' ? 'active' : ''}`}
          onClick={() => props.onActionChange('Buy')}
        >
          买入
        </button>
        <button
          type="button"
          class={`direction-tab sell ${props.action === 'Sell' ? 'active' : ''}`}
          onClick={() => props.onActionChange('Sell')}
        >
          卖出
        </button>
      </div>

      {/* Price Field */}
      <div class="mini-trade-form-row">
        <span class="field-label">价格</span>
        <div class="field-body">
          <input
            type="number"
            step="0.01"
            min="0.01"
            class="trade-num-input"
            value={props.price}
            onInput={(e) => props.onPriceChange(parseFloat(e.currentTarget.value) || 0)}
            placeholder="委托价格"
          />
          <button
            type="button"
            class="field-action-btn"
            onClick={() => props.onPriceChange(props.currentPrice)}
          >
            现价
          </button>
        </div>
      </div>

      {/* Shares Field & Ratios */}
      <div class="mini-trade-form-row">
        <span class="field-label">数量</span>
        <div class="field-body">
          <div class="shares-input-wrap">
            <input
              type="number"
              step="100"
              min="0"
              class="trade-num-input shares-input"
              value={props.shares}
              onInput={(e) => props.onSharesChange(parseInt(e.currentTarget.value, 10) || 0)}
              placeholder="股数"
            />
            <Show when={props.action === 'Sell'}>
              <span
                class="field-avail-tag"
                classList={{ locked: props.availSellShares === 0 }}
                title={`当前可用可卖: ${props.availSellShares} 股`}
              >
                可卖:{formatSharesDisplay(props.availSellShares)}
              </span>
            </Show>
          </div>
          <div class="quick-ratio-chips">
            <button type="button" class="ratio-chip" onClick={props.onFirstLotClick}>
              1手
            </button>
            <button type="button" class="ratio-chip" onClick={() => props.onRatioClick(0.25)}>
              {props.action === 'Sell' ? '1/4仓' : '1/4'}
            </button>
            <button type="button" class="ratio-chip" onClick={() => props.onRatioClick(0.5)}>
              半仓
            </button>
            <button type="button" class="ratio-chip" onClick={() => props.onRatioClick(1.0)}>
              {props.action === 'Sell' ? '清仓' : '全仓'}
            </button>
          </div>
        </div>
      </div>

      {/* Depth warning: only shown when exceeding 50% limit */}
      <Show when={props.depthHint?.isExceeded}>
        <div class="mini-trade-depth-hint warn">
          ⚠️ 卖一吃单占比达 {props.depthHint!.ratio}% (超50%深度上限)
        </div>
      </Show>
    </>
  )
}
