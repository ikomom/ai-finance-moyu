import { For } from 'solid-js'
import type { BrokerAccount } from '../../types/portfolio'

export interface PortfolioBrokerBarProps {
  brokers: BrokerAccount[]
  activeBrokerId: string
  presetName: string
  onSwitchBroker: (id: string) => void
  onEditFee: () => void
  onCreateBroker: () => void
  onResetBroker: () => void
  onDeleteBroker: () => void
}

export function PortfolioBrokerBar(props: PortfolioBrokerBarProps) {
  return (
    <div class="portfolio-broker-bar">
      <div class="broker-select-wrap">
        <span class="broker-label">账户:</span>
        <select
          class="broker-select"
          value={props.activeBrokerId}
          onChange={(e) => props.onSwitchBroker(e.currentTarget.value)}
        >
          <For each={props.brokers}>
            {(b) => <option value={b.id}>{b.name}</option>}
          </For>
        </select>
        <button
          type="button"
          class="broker-fee-chip"
          onClick={props.onEditFee}
          title="点击修改费率配置"
        >
          {props.presetName} ✎
        </button>
      </div>
      <div class="broker-actions">
        <button
          class="broker-btn primary"
          onClick={props.onCreateBroker}
        >
          + 新增账户
        </button>
        <button class="broker-btn" onClick={props.onResetBroker} title="清空持仓并将本金复原">
          重置
        </button>
        <button class="broker-btn danger" onClick={props.onDeleteBroker} title="删除当前券商账户">
          删除
        </button>
      </div>
    </div>
  )
}
