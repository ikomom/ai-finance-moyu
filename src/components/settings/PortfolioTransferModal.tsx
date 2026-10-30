import { createSignal, Show } from 'solid-js'
import './PortfolioModal.css'
import type { BrokerAccount } from '../../types/portfolio'
import { fmtCurrency } from '../../types'

export interface TransferModalProps {
  isOpen: boolean
  broker: BrokerAccount | null
  onClose: () => void
  onTransfer: (brokerId: string, amount: number, isDeposit: boolean) => Promise<void>
}

export function PortfolioTransferModal(props: TransferModalProps) {
  const [isDeposit, setIsDeposit] = createSignal(true)
  const [amount, setAmount] = createSignal<number>(10000)
  const [submitting, setSubmitting] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null)

  const maxWithdraw = () => props.broker?.availableCash ?? 0

  const handleQuickAdd = (delta: number) => {
    setAmount((prev) => Math.max(100, prev + delta))
  }

  const handleSubmit = async () => {
    if (!props.broker) return
    const amt = amount()
    if (amt <= 0 || !Number.isFinite(amt)) {
      setErrorMsg('请输入大于 0 的有效转账金额')
      return
    }
    if (!isDeposit() && amt > maxWithdraw()) {
      setErrorMsg(`转出金额超出可用现金 (${fmtCurrency(maxWithdraw())})`)
      return
    }
    setErrorMsg(null)
    try {
      setSubmitting(true)
      await props.onTransfer(props.broker.id, amt, isDeposit())
      props.onClose()
    } catch (e: any) {
      setErrorMsg(typeof e === 'string' ? e : e?.message ?? '转账失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Show when={props.isOpen && props.broker}>
      <div class="modal-overlay" onClick={props.onClose}>
        <div class="portfolio-modal transfer-modal" onClick={(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>资金存取 · 银证转账 ({props.broker!.name})</h3>
            <button class="mini-trade-close-btn" onClick={props.onClose}>×</button>
          </div>

          <div class="modal-body">
            <div class="transfer-type-tabs">
              <button
                type="button"
                class={`transfer-tab ${isDeposit() ? 'active buy' : ''}`}
                onClick={() => {
                  setIsDeposit(true)
                  setErrorMsg(null)
                }}
              >
                + 转入资金 (追加本金)
              </button>
              <button
                type="button"
                class={`transfer-tab ${!isDeposit() ? 'active sell' : ''}`}
                onClick={() => {
                  setIsDeposit(false)
                  setErrorMsg(null)
                }}
              >
                - 转出资金 (提取现金)
              </button>
            </div>

            <div class="transfer-current-cash">
              <span>当前可用现金:</span>
              <strong class="cash-num">{fmtCurrency(maxWithdraw())}</strong>
            </div>

            <div class="modal-field">
              <label>{isDeposit() ? '转入金额 (元)' : '转出金额 (元)'}</label>
              <input
                type="number"
                step="1000"
                min="100"
                value={amount()}
                onInput={(e) => setAmount(parseFloat(e.currentTarget.value) || 0)}
              />
            </div>

            <div class="transfer-quick-chips">
              <button type="button" class="quick-chip" onClick={() => handleQuickAdd(10000)}>+1万</button>
              <button type="button" class="quick-chip" onClick={() => handleQuickAdd(50000)}>+5万</button>
              <button type="button" class="quick-chip" onClick={() => handleQuickAdd(100000)}>+10万</button>
              <Show when={!isDeposit()}>
                <button type="button" class="quick-chip all" onClick={() => setAmount(maxWithdraw())}>全部转出</button>
              </Show>
            </div>

            <Show when={errorMsg()}>
              <div class="modal-error-msg">{errorMsg()}</div>
            </Show>
          </div>

          <div class="modal-footer">
            <button class="modal-btn" onClick={props.onClose}>取消</button>
            <button
              class={`modal-btn primary ${isDeposit() ? 'buy-btn' : 'sell-btn'}`}
              disabled={submitting() || amount() <= 0}
              onClick={handleSubmit}
            >
              {submitting() ? '处理中...' : isDeposit() ? `确认转入 (${fmtCurrency(amount())})` : `确认转出 (${fmtCurrency(amount())})`}
            </button>
          </div>
        </div>
      </div>
    </Show>
  )
}
