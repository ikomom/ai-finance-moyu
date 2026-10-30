import { createEffect, createSignal, For, Show } from 'solid-js'
import './PortfolioModal.css'
import {
  CAPITAL_PRESETS,
  FEE_PRESETS,
  POPULAR_BROKERS,
  type BrokerAccount,
  type BrokerFeeConfig,
  type FeePresetId,
} from '../../types/portfolio'

export interface AccountModalProps {
  isOpen: boolean
  initialBroker?: BrokerAccount | null
  onClose: () => void
  onSave: (name: string, initialCash: number, feeConfig: BrokerFeeConfig, availableCash?: number) => Promise<void>
}

export function PortfolioAccountModal(props: AccountModalProps) {
  const [name, setName] = createSignal('中国银河')
  const [initialCash, setInitialCash] = createSignal(100000)
  const [availableCash, setAvailableCash] = createSignal(100000)
  const [presetId, setPresetId] = createSignal<FeePresetId>('vip_low')
  const [stockComm, setStockComm] = createSignal(0.0000954)
  const [stockMinComm, setStockMinComm] = createSignal(0.5)
  const [stockStamp, setStockStamp] = createSignal(0.0005)
  const [etfComm, setEtfComm] = createSignal(0.00005)
  const [etfMinComm, setEtfMinComm] = createSignal(0.25)
  const [cbComm, setCbComm] = createSignal(0.00005)
  const [cbMinComm, setCbMinComm] = createSignal(0.5)
  const [saving, setSaving] = createSignal(false)

  createEffect(() => {
    if (props.isOpen) {
      if (props.initialBroker) {
        const b = props.initialBroker
        setName(b.name)
        setInitialCash(b.initialCash)
        setAvailableCash(b.availableCash)
        const cfg = b.feeConfig
        setPresetId((cfg.preset as FeePresetId) || 'vip_low')
        setStockComm(cfg.stockRate)
        setStockMinComm(cfg.stockMinFee)
        setEtfComm(cfg.etfRate)
        setEtfMinComm(cfg.etfMinFee)
        setCbComm(cfg.bondRate)
        setCbMinComm(cfg.bondMinFee ?? 0.5)
        setStockStamp(cfg.stampDutyRate)
      } else {
        setName('中国银河')
        setInitialCash(100000)
        setAvailableCash(100000)
        applyPreset('vip_low')
      }
    }
  })

  const applyPreset = (id: FeePresetId) => {
    setPresetId(id)
    const p = FEE_PRESETS.find((x) => x.id === id)
    if (p) {
      setStockComm(p.config.stockRate)
      setStockMinComm(p.config.stockMinFee)
      setEtfComm(p.config.etfRate)
      setEtfMinComm(p.config.etfMinFee)
      setCbComm(p.config.bondRate)
      setCbMinComm(p.config.bondMinFee ?? 0.5)
      setStockStamp(p.config.stampDutyRate)
    }
  }

  const handleSave = async () => {
    if (!name().trim()) return
    try {
      setSaving(true)
      const feeConfig: BrokerFeeConfig = {
        preset: presetId(),
        stockRate: stockComm(),
        stockMinFee: stockMinComm(),
        etfRate: etfComm(),
        etfMinFee: etfMinComm(),
        bondRate: cbComm(),
        bondMinFee: cbMinComm(),
        stampDutyRate: stockStamp(),
      }
      await props.onSave(
        name().trim(),
        initialCash(),
        feeConfig,
        props.initialBroker ? availableCash() : undefined
      )
      props.onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Show when={props.isOpen}>
      <div class="modal-overlay" onClick={props.onClose}>
        <div class="portfolio-modal" onClick={(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>{props.initialBroker ? '编辑券商与费率' : '新增模拟券商账户'}</h3>
            <button class="mini-trade-close-btn" onClick={props.onClose}>×</button>
          </div>

          <div class="modal-body">
            <div class="modal-field">
              <label>券商/账户名称</label>
              <input
                type="text"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                placeholder="例如: 华泰证券 / 中国银河"
              />
              <div class="modal-quick-chips">
                <For each={POPULAR_BROKERS}>
                  {(b) => (
                    <button
                      type="button"
                      class={`quick-chip ${name() === b ? 'active' : ''}`}
                      onClick={() => setName(b)}
                    >
                      {b}
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="modal-field">
              <label>{props.initialBroker ? '初始总本金 (元)' : '初始模拟本金 (元)'}</label>
              <input
                type="number"
                step="10000"
                min="1000"
                value={initialCash()}
                onInput={(e) => setInitialCash(parseFloat(e.currentTarget.value) || 0)}
              />
              <div class="modal-quick-chips">
                <For each={CAPITAL_PRESETS}>
                  {(c) => (
                    <button
                      type="button"
                      class={`quick-chip ${initialCash() === c ? 'active' : ''}`}
                      onClick={() => setInitialCash(c)}
                    >
                      {c / 10000}万
                    </button>
                  )}
                </For>
              </div>
            </div>

            <Show when={props.initialBroker}>
              <div class="modal-field">
                <label>当前可用现金 (元)</label>
                <input
                  type="number"
                  step="1000"
                  min="0"
                  value={availableCash()}
                  onInput={(e) => setAvailableCash(parseFloat(e.currentTarget.value) || 0)}
                />
              </div>
            </Show>

            <div class="modal-field">
              <label>快捷费率模板</label>
              <select
                value={presetId()}
                onChange={(e) => applyPreset(e.currentTarget.value as FeePresetId)}
              >
                <For each={FEE_PRESETS}>
                  {(p) => <option value={p.id}>{p.name} - {p.badge}</option>}
                </For>
                <option value="custom">自定义费率</option>
              </select>
            </div>

            <div class="fee-rates-grid">
              <div class="modal-field">
                <label>股票佣金率 (万分之)</label>
                <input
                  type="number"
                  step="0.00001"
                  value={stockComm()}
                  onInput={(e) => {
                    setStockComm(parseFloat(e.currentTarget.value) || 0)
                    setPresetId('custom')
                  }}
                />
              </div>
              <div class="modal-field">
                <label>股票最低起收佣金 (元)</label>
                <input
                  type="number"
                  step="0.1"
                  value={stockMinComm()}
                  onInput={(e) => {
                    setStockMinComm(parseFloat(e.currentTarget.value) || 0)
                    setPresetId('custom')
                  }}
                />
              </div>
              <div class="modal-field">
                <label>ETF 佣金率</label>
                <input
                  type="number"
                  step="0.00001"
                  value={etfComm()}
                  onInput={(e) => {
                    setEtfComm(parseFloat(e.currentTarget.value) || 0)
                    setPresetId('custom')
                  }}
                />
              </div>
              <div class="modal-field">
                <label>ETF 最低起收佣金 (元)</label>
                <input
                  type="number"
                  step="0.05"
                  value={etfMinComm()}
                  onInput={(e) => {
                    setEtfMinComm(parseFloat(e.currentTarget.value) || 0)
                    setPresetId('custom')
                  }}
                />
              </div>
              <div class="modal-field">
                <label>可转债佣金率</label>
                <input
                  type="number"
                  step="0.00001"
                  value={cbComm()}
                  onInput={(e) => {
                    setCbComm(parseFloat(e.currentTarget.value) || 0)
                    setPresetId('custom')
                  }}
                />
              </div>
              <div class="modal-field">
                <label>可转债最低佣金 (元)</label>
                <input
                  type="number"
                  step="0.1"
                  value={cbMinComm()}
                  onInput={(e) => {
                    setCbMinComm(parseFloat(e.currentTarget.value) || 0)
                    setPresetId('custom')
                  }}
                />
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="modal-btn" onClick={props.onClose}>取消</button>
            <button class="modal-btn primary" disabled={saving()} onClick={handleSave}>
              {saving() ? '保存中...' : '确定保存'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}
