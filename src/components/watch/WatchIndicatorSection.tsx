import { Show } from 'solid-js'
import type { StockIndicatorMode, WatchItem } from '../../types'

export interface WatchIndicatorSectionProps {
  item: WatchItem
  onUpdate: (patch: Partial<WatchItem>) => void
  onToast?: (msg: string, kind?: '' | 'ok' | 'bad') => void
}

export function WatchIndicatorSection(props: WatchIndicatorSectionProps) {
  return (
    <div class="drawer-section">
      <div class="drawer-section-title">指标策略覆盖 (MA均线与MACD)</div>
      <div class="drawer-row">
        <label class="drawer-label">策略档位：</label>
        <select
          class="indicator-select"
          value={props.item.indicatorMode ?? 'inherit'}
          onChange={(e) => {
            const val = e.currentTarget.value as StockIndicatorMode
            props.onUpdate({ indicatorMode: val === 'inherit' ? null : val })
          }}
        >
          <option value="inherit">跟随全局设置 (默认)</option>
          <option value="ultra_short">极速超短 (MA 3/5/10 · MACD 6/13/5)</option>
          <option value="classic">经典短线 (MA 5/10/20 · MACD 12/26/9)</option>
          <option value="swing">中线波段 (MA 10/30/60 · MACD 19/39/9)</option>
          <option value="custom">自定义参数</option>
        </select>
      </div>

      <Show when={props.item.indicatorMode === 'custom'}>
        <div class="custom-indicator-inputs">
          <div class="quick-fill-row" style="margin-bottom: 6px;">
            <span class="quick-fill-label">快捷填入档位：</span>
            <button
              type="button"
              class="quick-fill-chip"
              onClick={() => {
                props.onUpdate({
                  customMa: [3, 5, 10],
                  customMacd: [6, 13, 5],
                })
                props.onToast?.('已填入「极速超短」参数', 'ok')
              }}
            >
              ⚡ 极速超短 (3/5/10 · 6/13/5)
            </button>
            <button
              type="button"
              class="quick-fill-chip"
              onClick={() => {
                props.onUpdate({
                  customMa: [5, 10, 20],
                  customMacd: [12, 26, 9],
                })
                props.onToast?.('已填入「经典短线」参数', 'ok')
              }}
            >
              🎯 经典短线 (5/10/20 · 12/26/9)
            </button>
            <button
              type="button"
              class="quick-fill-chip"
              onClick={() => {
                props.onUpdate({
                  customMa: [10, 30, 60],
                  customMacd: [19, 39, 9],
                })
                props.onToast?.('已填入「中线波段」参数', 'ok')
              }}
            >
              🌊 中线波段 (10/30/60 · 19/39/9)
            </button>
          </div>
          <div class="custom-group">
            <span class="custom-title">MA 周期:</span>
            <input
              type="number"
              min="1"
              max="250"
              value={props.item.customMa?.[0] ?? 5}
              onInput={(e) => {
                const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 5))
                const ma = props.item.customMa ? [...props.item.customMa] : [5, 10, 20]
                ma[0] = v
                props.onUpdate({ customMa: ma as [number, number, number] })
              }}
            />
            <input
              type="number"
              min="1"
              max="250"
              value={props.item.customMa?.[1] ?? 10}
              onInput={(e) => {
                const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 10))
                const ma = props.item.customMa ? [...props.item.customMa] : [5, 10, 20]
                ma[1] = v
                props.onUpdate({ customMa: ma as [number, number, number] })
              }}
            />
            <input
              type="number"
              min="1"
              max="250"
              value={props.item.customMa?.[2] ?? 20}
              onInput={(e) => {
                const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 20))
                const ma = props.item.customMa ? [...props.item.customMa] : [5, 10, 20]
                ma[2] = v
                props.onUpdate({ customMa: ma as [number, number, number] })
              }}
            />
          </div>
          <div class="custom-group">
            <span class="custom-title">MACD (快/慢/信号):</span>
            <input
              type="number"
              min="1"
              max="250"
              value={props.item.customMacd?.[0] ?? 12}
              onInput={(e) => {
                const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 12))
                const macd = props.item.customMacd ? [...props.item.customMacd] : [12, 26, 9]
                macd[0] = v
                props.onUpdate({ customMacd: macd as [number, number, number] })
              }}
            />
            <input
              type="number"
              min="1"
              max="250"
              value={props.item.customMacd?.[1] ?? 26}
              onInput={(e) => {
                const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 26))
                const macd = props.item.customMacd ? [...props.item.customMacd] : [12, 26, 9]
                macd[1] = v
                props.onUpdate({ customMacd: macd as [number, number, number] })
              }}
            />
            <input
              type="number"
              min="1"
              max="250"
              value={props.item.customMacd?.[2] ?? 9}
              onInput={(e) => {
                const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 9))
                const macd = props.item.customMacd ? [...props.item.customMacd] : [12, 26, 9]
                macd[2] = v
                props.onUpdate({ customMacd: macd as [number, number, number] })
              }}
            />
          </div>
        </div>
      </Show>
    </div>
  )
}
