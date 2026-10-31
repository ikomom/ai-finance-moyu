import { createMemo, createSignal, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { showToast, snapshot } from '../../store'
import { fmtMoney, fmtPct, fmtPrice, profitAmount, profitPct, trendClass } from '../../types'
import './CostAlertModal.css'

export interface CostAlertModalProps {
  code: string
  onClose: () => void
}

export function CostAlertModal(props: CostAlertModalProps) {
  const s = () => snapshot()
  const quote = () => s()?.quotes.find((q) => q.code === props.code)
  const watchItem = () => s()?.config.watchlist.find((w) => w.code === props.code)

  const [costPrice, setCostPrice] = createSignal(watchItem()?.costPrice?.toString() ?? '')
  const [shares, setShares] = createSignal(watchItem()?.shares?.toString() ?? '')
  const [isSaving, setIsSaving] = createSignal(false)

  const parsedCost = () => {
    const val = parseFloat(costPrice().trim())
    return isNaN(val) || val <= 0 ? null : val
  }

  const parsedShares = () => {
    const val = parseInt(shares().trim(), 10)
    return isNaN(val) || val <= 0 ? null : val
  }

  const previewPnl = createMemo(() => {
    const q = quote()
    const c = parsedCost()
    const sh = parsedShares()
    if (!q || !c) return null
    const pct = profitPct(q.price, c)
    const amt = sh ? profitAmount(q.price, c, sh) : null
    return { pct, amt }
  })

  const handleSave = async () => {
    const snap = s()
    if (!snap) return
    setIsSaving(true)
    try {
      const c = parsedCost()
      const sh = parsedShares()
      const updatedWatchlist = snap.config.watchlist.map((item) => {
        if (item.code !== props.code) return item
        return {
          ...item,
          costPrice: c ?? undefined,
          shares: sh ?? undefined,
        }
      })
      const newCfg = { ...snap.config, watchlist: updatedWatchlist }
      await invoke('save_config', { cfg: newCfg })
      showToast(`已保存「${quote()?.name ?? props.code}」成本设置`)
      props.onClose()
    } catch (e) {
      console.error(e)
      showToast(`保存失败: ${e}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    const snap = s()
    if (!snap) return
    setIsSaving(true)
    try {
      const updatedWatchlist = snap.config.watchlist.map((item) => {
        if (item.code !== props.code) return item
        const { costPrice: _c, shares: _s, ...rest } = item
        return rest
      })
      const newCfg = { ...snap.config, watchlist: updatedWatchlist }
      await invoke('save_config', { cfg: newCfg })
      showToast(`已清空「${quote()?.name ?? props.code}」成本设置`)
      props.onClose()
    } catch (e) {
      console.error(e)
      showToast(`清空失败: ${e}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      class="cost-modal-backdrop"
      onClick={props.onClose}
      data-tauri-drag-region="none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        class="cost-modal"
        onClick={(e) => e.stopPropagation()}
        data-tauri-drag-region="none"
      >
        <div class="cost-modal-header">
          <span class="cost-modal-title">⚙️ 持仓成本与预警</span>
          <button type="button" class="cost-modal-close" onClick={props.onClose}>
            ×
          </button>
        </div>

        <div class="cost-modal-stock-info">
          <div>
            <span class="cost-modal-stock-name">{quote()?.name ?? props.code}</span>
            <span class="cost-modal-stock-code">{props.code}</span>
          </div>
          <Show when={quote()}>
            {(q) => (
              <span class={`cost-modal-price ${trendClass(q().change)}`}>
                {fmtPrice(q().price)} ({fmtPct(q().changePct)})
              </span>
            )}
          </Show>
        </div>

        <div class="cost-modal-fields">
          <div class="cost-modal-field">
            <label>持仓成本 (元)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              class="cost-modal-input"
              placeholder="0.00"
              value={costPrice()}
              onInput={(e) => setCostPrice(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              autofocus
            />
          </div>

          <div class="cost-modal-field">
            <label>持仓股数 (股)</label>
            <input
              type="number"
              step="100"
              min="0"
              class="cost-modal-input"
              placeholder="100"
              value={shares()}
              onInput={(e) => setShares(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
            />
          </div>
        </div>

        <Show when={previewPnl()}>
          {(pnl) => (
            <div class="cost-modal-preview">
              <span>预计盈亏:</span>
              <span class={`val ${trendClass(pnl().pct ?? 0)}`}>
                <Show when={pnl().pct !== null}>
                  {fmtPct(pnl().pct!)}
                </Show>
                <Show when={pnl().amt !== null}>
                  {' '}({fmtMoney(pnl().amt!)})
                </Show>
              </span>
            </div>
          )}
        </Show>

        <div class="cost-modal-actions">
          <Show when={watchItem()?.costPrice || watchItem()?.shares}>
            <button
              type="button"
              class="cost-modal-btn clear"
              onClick={handleClear}
              disabled={isSaving()}
            >
              清空
            </button>
          </Show>
          <button
            type="button"
            class="cost-modal-btn cancel"
            onClick={props.onClose}
            disabled={isSaving()}
          >
            取消
          </button>
          <button
            type="button"
            class="cost-modal-btn confirm"
            onClick={handleSave}
            disabled={isSaving()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
