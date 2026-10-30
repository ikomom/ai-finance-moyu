import { createEffect, createSignal, Show } from 'solid-js'
import './MiniTradeDrawer.css'
import './MiniTradeToast.css'
import {
  cancelSimulatedOrder,
  createBrokerAccount,
  executeSimulatedTrade,
  getPortfolioSummary,
} from '../../services/portfolio'
import type { BrokerAccount, PortfolioSummary, TradeAction } from '../../types/portfolio'
import { fmtCurrency } from '../../types'
import { PortfolioAccountModal } from '../settings/PortfolioAccountModal'
import { BrokerDropdown } from './BrokerDropdown'
import { PendingOrdersPopover } from './PendingOrdersPopover'
import { TradeFormFields } from './TradeFormFields'
import {
  computeOrderBookDepthHint,
  computeSharesByRatio,
  estimateTradeFee,
  getAvailableSellShares,
  isPendingLimitOrder,
} from './tradeHelpers'

export interface MiniTradeDrawerProps {
  code: string
  name: string
  currentPrice: number
  initialPrice?: number
  bids?: [number, number][]
  asks?: [number, number][]
  preClose?: number
  onClose: () => void
  onTradeSuccess?: () => void
}

export function MiniTradeDrawer(props: MiniTradeDrawerProps) {
  const [summary, setSummary] = createSignal<PortfolioSummary | null>(null)
  const [activeBrokerId, setActiveBrokerId] = createSignal<string>('')
  const [action, setAction] = createSignal<TradeAction>('Buy')
  const [price, setPrice] = createSignal<number>(props.initialPrice || props.currentPrice || 0)
  const [shares, setShares] = createSignal<number>(100)
  const [loading, setLoading] = createSignal<boolean>(false)
  const [isSuccess, setIsSuccess] = createSignal(false)
  const [successMsg, setSuccessMsg] = createSignal<string>('')
  const [bubbleMsg, setBubbleMsg] = createSignal<string | null>(null)
  const [accountModalOpen, setAccountModalOpen] = createSignal(false)
  let bubbleTimer: any = null

  const showBubble = (msg: string) => {
    if (bubbleTimer) clearTimeout(bubbleTimer)
    setBubbleMsg(msg)
    bubbleTimer = setTimeout(() => setBubbleMsg(null), 2400)
  }

  const loadData = async () => {
    try {
      const s = await getPortfolioSummary()
      setSummary(s)
      if (!activeBrokerId() && s.activeBrokerId) setActiveBrokerId(s.activeBrokerId)
    } catch (e: any) {
      showBubble(e?.message ?? '获取账户数据失败')
    }
  }

  createEffect(() => { loadData() })
  createEffect(() => {
    if (props.initialPrice && props.initialPrice > 0) {
      setPrice(props.initialPrice)
    } else if (props.currentPrice > 0 && price() === 0) {
      setPrice(props.currentPrice)
    }
  })

  const currentBroker = (): BrokerAccount | undefined => {
    const s = summary()
    return s ? (s.brokers.find((b) => b.id === activeBrokerId()) ?? s.brokers[0]) : undefined
  }

  const currentPos = () => {
    const s = summary()
    const targetId = currentBroker()?.id ?? activeBrokerId()
    return s && targetId ? s.positions.find((p) => p.code === props.code && p.brokerId === targetId) : undefined
  }

  const availSellShares = () => getAvailableSellShares(currentPos(), summary()?.strictMode ?? true)
  const estFee = () => estimateTradeFee(props.code, action(), price(), shares(), currentBroker()?.feeConfig)
  const isPending = () => isPendingLimitOrder(action(), price(), props.currentPrice, props.bids, props.asks)

  const currentPendingOrders = () => {
    const s = summary()
    const bId = currentBroker()?.id
    return s && bId ? (s.pendingOrders ?? []).filter((o) => o.code === props.code && o.brokerId === bId) : []
  }

  const handleRatioClick = (ratio: number) => {
    const b = currentBroker()
    if (!b) return
    if (action() === 'Sell' && availSellShares() <= 0) {
      setShares(0)
      showBubble('当前可卖为 0 股，无法选仓')
      return
    }
    const sh = computeSharesByRatio(action(), ratio, b.availableCash, price(), currentPos(), summary()?.strictMode ?? true)
    if (action() === 'Buy' && sh <= 0) {
      setShares(0)
      showBubble('可用现金不足以买入 1 手')
    } else {
      setShares(sh)
    }
  }

  const handleFirstLotClick = () => {
    if (action() === 'Sell') {
      const max = availSellShares()
      if (max <= 0) {
        setShares(0)
        showBubble('当前可卖为 0 股 (今日买入 T+1 锁定)')
      } else {
        setShares(max < 100 ? max : 100)
      }
    } else {
      setShares(100)
    }
  }

  const depthHint = () => computeOrderBookDepthHint(action(), shares(), props.asks)

  const handleTrade = async () => {
    const b = currentBroker()
    if (!b || loading() || isSuccess()) return
    if (price() <= 0) return showBubble('请输入有效的委托价格')
    if (shares() <= 0) return showBubble('委托数量必须大于 0')
    if (action() === 'Sell') {
      const max = availSellShares()
      if (max <= 0) return showBubble('⚠️ 当前可用可卖仅 0 股 (今日买入 T+1 锁定中)')
      if (shares() > max) return showBubble(`⚠️ 卖出数量超出上限，当前最多可卖 ${max} 股`)
    } else if (totalPay() > b.availableCash) {
      return showBubble('⚠️ 可用现金不足以支付委托金额及税费')
    }

    try {
      setLoading(true)
      const res = await executeSimulatedTrade({
        brokerId: b.id, code: props.code, name: props.name, action: action(),
        shares: shares(), price: price(), preClose: props.preClose, bids: props.bids, asks: props.asks,
      })
      setSummary(res.summary)
      setIsSuccess(true)
      setSuccessMsg(res.message)
      props.onTradeSuccess?.()
      setTimeout(() => { props.onClose() }, res.status === 'pending' ? 1200 : 800)
    } catch (e: any) {
      showBubble(typeof e === 'string' ? e : e?.message ?? '交易失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    try {
      setLoading(true)
      setSummary(await cancelSimulatedOrder(orderId))
      showBubble('✓ 已成功撤销挂单，资金/持仓已解冻')
    } catch (e: any) {
      showBubble(typeof e === 'string' ? e : e?.message ?? '撤单失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelAllOrders = async () => {
    const orders = currentPendingOrders()
    if (orders.length === 0) return
    try {
      setLoading(true)
      let updated: PortfolioSummary | null = null
      for (const order of orders) updated = await cancelSimulatedOrder(order.id)
      if (updated) setSummary(updated)
      showBubble(`✓ 已撤销当前标的全部挂单 (${orders.length}笔)`)
    } catch (e: any) {
      showBubble(typeof e === 'string' ? e : e?.message ?? '撤单失败')
    } finally {
      setLoading(false)
    }
  }

  const totalPay = () => {
    const gross = price() * shares()
    const fee = estFee().total
    return action() === 'Buy' ? gross + fee : Math.max(0, gross - fee)
  }

  const actionButtonText = () => {
    if (isSuccess()) return successMsg()
    if (loading()) return '提交中...'
    const actionLabel = action() === 'Buy' ? '买入' : '卖出'
    return isPending() ? `限价${actionLabel} (挂单排队)` : `立即${actionLabel}`
  }

  return (
    <div class="mini-trade-overlay" onClick={props.onClose}>
      <div class="mini-trade-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Tier 1: Header - Clean & Roomy */}
        <div class="mini-trade-header">
          <div class="mini-trade-header-left">
            <Show
              when={(summary()?.brokers.length ?? 0) > 1}
              fallback={<span class="mini-trade-broker-label">{currentBroker()?.name || '模拟账户'}</span>}
            >
              <BrokerDropdown
                brokers={summary()?.brokers ?? []}
                activeId={activeBrokerId()}
                onSelect={(id) => setActiveBrokerId(id)}
                onOpenCreateModal={() => setAccountModalOpen(true)}
              />
            </Show>
            <PendingOrdersPopover
              orders={currentPendingOrders()}
              onCancel={handleCancelOrder}
              onCancelAll={handleCancelAllOrders}
              disabled={loading()}
            />
            <span class="mini-trade-cash">现金: {fmtCurrency(currentBroker()?.availableCash ?? 0)}</span>
          </div>
          <button class="mini-trade-close-x" onClick={props.onClose} title="关闭">×</button>
        </div>

        <Show
          when={(summary()?.brokers.length ?? 0) > 0}
          fallback={
            <div class="mini-trade-empty-broker">
              <span>暂无券商账户，请先开立模拟账户</span>
              <button type="button" class="mini-trade-create-btn" onClick={() => setAccountModalOpen(true)}>
                + 立即开户
              </button>
            </div>
          }
        >
          {/* Form Fields & Quick Ratios */}
          <TradeFormFields
            action={action()}
            onActionChange={(a) => setAction(a)}
            price={price()}
            onPriceChange={(p) => setPrice(p)}
            currentPrice={props.currentPrice}
            shares={shares()}
            onSharesChange={(s) => setShares(s)}
            availSellShares={availSellShares()}
            onRatioClick={handleRatioClick}
            onFirstLotClick={handleFirstLotClick}
            depthHint={depthHint()}
          />

          {/* Tier 5: Summary & Submit Action */}
          <div class="mini-trade-footer-bar">
            <div class="footer-summary-col">
              <div class="summary-line-main">合计 {fmtCurrency(totalPay())}</div>
              <div class="summary-line-sub">
                含预估费 {fmtCurrency(estFee().total)}
                <Show when={isPending()}>
                  <span class="pending-tip-badge"> (挂单排队)</span>
                </Show>
              </div>
            </div>

            <div class="mini-trade-submit-wrap">
              <Show when={bubbleMsg()}>
                <div class="mini-trade-bubble-toast">{bubbleMsg()}</div>
              </Show>
              <button
                type="button"
                class={`mini-trade-action-btn ${isSuccess() ? 'success' : action() === 'Buy' ? 'buy' : 'sell'}`}
                classList={{ 'is-pending': isPending() && !isSuccess() }}
                disabled={loading() || isSuccess()}
                onClick={handleTrade}
              >
                {actionButtonText()}
              </button>
            </div>
          </div>
        </Show>

        {/* Global Toast for Smooth Success Feedback */}
        <Show when={isSuccess()}>
          <div class="mini-trade-center-toast">{successMsg()}</div>
        </Show>
      </div>

      <PortfolioAccountModal
        isOpen={accountModalOpen()}
        onClose={() => setAccountModalOpen(false)}
        onSave={async (n, c, f) => { await createBrokerAccount(n, c, f); await loadData(); setAccountModalOpen(false) }}
      />
    </div>
  )
}
