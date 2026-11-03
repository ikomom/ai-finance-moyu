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

  const isPortfolio = () => Boolean(s()?.config.enablePortfolio)
  const portfolioPos = () => {
    if (!isPortfolio()) return null
    return (
      (s()?.positions ?? []).find(
        (p) => p.code.toLowerCase() === props.code.toLowerCase() && p.shares > 0
      ) ?? null
    )
  }

  const initialCost = () => {
    if (isPortfolio()) {
      const pos = portfolioPos()
      return pos ? pos.costPrice.toFixed(2) : ''
    }
    return watchItem()?.costPrice?.toString() ?? ''
  }

  const initialShares = () => {
    if (isPortfolio()) {
      const pos = portfolioPos()
      return pos ? String(pos.shares) : ''
    }
    return watchItem()?.shares?.toString() ?? ''
  }

  const [costPrice, setCostPrice] = createSignal(initialCost())
  const [shares, setShares] = createSignal(initialShares())
  const [isSaving, setIsSaving] = createSignal(false)

  const parsedCost = () => {
    if (isPortfolio()) {
      const pos = portfolioPos()
      return pos ? pos.costPrice : null
    }
    const val = parseFloat(costPrice().trim())
    return isNaN(val) || val <= 0 ? null : val
  }

  const parsedShares = () => {
    if (isPortfolio()) {
      const pos = portfolioPos()
      return pos ? pos.shares : null
    }
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

        <Show when={isPortfolio()}>
          <div style="font-size: 11px; color: #a5b4fc; background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.28); border-radius: 6px; padding: 6px 10px; margin-bottom: 8px;">
            🔒 已开启模拟账本：此标的成本由模拟买卖自动核算锁定，清仓后成本线自动消失。如需调整请使用主悬浮窗「买卖」下单。
          </div>
        </Show>

        <div class="cost-modal-fields">
          <div class="cost-modal-field">
            <label>持仓成本 (元)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              disabled={isPortfolio()}
              class="cost-modal-input"
              placeholder={isPortfolio() ? (portfolioPos() ? '' : '未持仓') : '0.00'}
              value={costPrice()}
              onInput={(e) => setCostPrice(e.currentTarget.value)}
              onKeyDown={(e) => !isPortfolio() && e.key === 'Enter' && void handleSave()}
              autofocus={!isPortfolio()}
            />
          </div>

          <div class="cost-modal-field">
            <label>持仓股数 (股)</label>
            <input
              type="number"
              step="100"
              min="0"
              disabled={isPortfolio()}
              class="cost-modal-input"
              placeholder={isPortfolio() ? (portfolioPos() ? '' : '未持仓') : '100'}
              value={shares()}
              onInput={(e) => setShares(e.currentTarget.value)}
              onKeyDown={(e) => !isPortfolio() && e.key === 'Enter' && void handleSave()}
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
          <Show when={!isPortfolio() && (watchItem()?.costPrice || watchItem()?.shares)}>
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
            {isPortfolio() ? '关闭' : '取消'}
          </button>
          <Show when={!isPortfolio()}>
            <button
              type="button"
              class="cost-modal-btn confirm"
              onClick={handleSave}
              disabled={isSaving()}
            >
              保存
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}
