import { createEffect, createSignal, Show } from 'solid-js'
import './PortfolioTab.css'
import {
  cancelAllSimulatedOrders, cancelSimulatedOrder, createBrokerAccount,
  deleteBrokerAccount, getPortfolioSummary, resetBrokerAccount,
  setActiveBroker, setPortfolioStrictMode, transferBrokerCash, updateBrokerAccount,
} from '../../services/portfolio'
import { FEE_PRESETS, type BrokerAccount, type BrokerFeeConfig, type PortfolioSummary } from '../../types/portfolio'
import { PortfolioOrdersTable, PortfolioPositionsTable, PortfolioTradesTable } from './PortfolioTables'
import { PortfolioStatsGrid } from './PortfolioStatsGrid'
import { PortfolioBrokerBar } from './PortfolioBrokerBar'
import { PortfolioAccountModal } from './PortfolioAccountModal'
import { PortfolioTransferModal } from './PortfolioTransferModal'
import { useSettings } from './SettingsContext'

export function PortfolioTab() {
  const { form, setForm, save } = useSettings()
  const [summary, setSummary] = createSignal<PortfolioSummary | null>(null)
  const [subTab, setSubTab] = createSignal<'positions' | 'trades' | 'orders'>('positions')
  const [modalOpen, setModalOpen] = createSignal(false)
  const [transferModalOpen, setTransferModalOpen] = createSignal(false)
  const [editingBroker, setEditingBroker] = createSignal<BrokerAccount | null>(null)
  const [actionLoading, setActionLoading] = createSignal(false)

  const reloadSummary = async () => {
    try {
      const s = await getPortfolioSummary()
      setSummary(s)
    } catch (e) {
      console.error('Failed to load portfolio summary:', e)
    }
  }

  createEffect(() => {
    reloadSummary()
  })

  const currentBroker = (): BrokerAccount | undefined => {
    const s = summary()
    if (!s) return undefined
    return s.brokers.find((b) => b.id === s.activeBrokerId) ?? s.brokers[0]
  }

  const currentPositions = () => {
    const s = summary()
    const bId = currentBroker()?.id ?? s?.activeBrokerId
    if (!s || !bId) return []
    return s.positions.filter((p) => p.brokerId === bId)
  }

  const currentTrades = () => {
    const s = summary()
    const bId = currentBroker()?.id ?? s?.activeBrokerId
    if (!s || !bId) return []
    return s.trades.filter((t) => t.brokerId === bId)
  }

  const currentPendingOrders = () => {
    const s = summary()
    const bId = currentBroker()?.id ?? s?.activeBrokerId
    if (!s || !bId) return []
    return (s.pendingOrders ?? []).filter((o) => o.brokerId === bId)
  }

  const handleCancelOrder = async (orderId: string) => {
    try {
      setActionLoading(true)
      const updated = await cancelSimulatedOrder(orderId)
      setSummary(updated)
    } catch (e: any) {
      alert(typeof e === 'string' ? e : e?.message ?? '撤单失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCancelAllOrders = async () => {
    const b = currentBroker()
    if (!b) return
    try {
      setActionLoading(true)
      const updated = await cancelAllSimulatedOrders(b.id)
      setSummary(updated)
    } catch (e: any) {
      alert(typeof e === 'string' ? e : e?.message ?? '批量撤单失败')
    } finally {
      setActionLoading(false)
    }
  }

  const brokerCash = () => currentBroker()?.availableCash ?? 0
  const brokerFrozenCash = () => currentPendingOrders().reduce((sum, o) => sum + (o.frozenCash || 0), 0)
  const brokerMarketValue = () => currentPositions().reduce((sum, p) => sum + p.marketValue, 0)
  const brokerEquity = () => brokerCash() + brokerFrozenCash() + brokerMarketValue()
  const brokerPnl = () => currentPositions().reduce((sum, p) => sum + p.floatingPnl, 0)
  const brokerTodayPnl = () => currentPositions().reduce((sum, p) => sum + p.todayPnl, 0)
  const brokerRatio = () => (brokerEquity() > 0 ? (brokerMarketValue() / brokerEquity()) * 100 : 0)

  const handleTogglePortfolio = async (enabled: boolean) => {
    setForm('enablePortfolio', enabled)
    await save()
  }

  const handleSwitchBroker = async (id: string) => {
    try { setSummary(await setActiveBroker(id)) } catch (e) { console.error(e) }
  }

  const handleResetBroker = async () => {
    const b = currentBroker()
    if (!b) return
    const msg = `确认重置券商【${b.name}】？\n清空全部持仓及交易流水，本金复原为 ¥${b.initialCash.toLocaleString()}。`
    if (!confirm(msg)) return
    setSummary(await resetBrokerAccount(b.id))
  }

  const handleDeleteBroker = async () => {
    const b = currentBroker()
    if (!b || !confirm(`确认删除券商【${b.name}】？`)) return
    try {
      const updated = await deleteBrokerAccount(b.id)
      setSummary(updated)
      if (updated.brokers.length === 0) {
        setEditingBroker(null)
        setModalOpen(true)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleTransferCash = async (brokerId: string, amount: number, isDeposit: boolean) => {
    const updated = await transferBrokerCash(brokerId, amount, isDeposit)
    setSummary(updated)
  }

  const handleSaveBrokerModal = async (
    name: string,
    initialCash: number,
    feeConfig: BrokerFeeConfig,
    availableCash?: number
  ) => {
    const b = editingBroker()
    const updated = b
      ? await updateBrokerAccount({ ...b, name, initialCash, availableCash: availableCash ?? b.availableCash, feeConfig })
      : await createBrokerAccount(name, initialCash, feeConfig)
    setSummary(updated)
  }

  const presetName = () => {
    const b = currentBroker()
    if (!b) return '未知费率'
    const match = FEE_PRESETS.find((p) => p.id === b.feeConfig.preset)
    return match ? match.name : (b.feeConfig.preset || '自定义费率')
  }

  return (
    <div class="portfolio-tab">
      <div class="portfolio-banner">
        <div class="banner-left">
          <span class="banner-title">模拟投资与实盘复盘账本</span>
          <span class="banner-desc">多券商资金隔离、自适应费率核算、加减仓成本摊薄与真实盈亏复盘</span>
        </div>
        <div class="banner-right">
          <Show when={(summary()?.brokers.length ?? 0) > 0}>
            <button
              type="button"
              class={`mode-toggle-btn ${summary()?.strictMode ? 'strict' : 'sandbox'}`}
              onClick={async () => {
                const s = summary()
                if (!s) return
                const updated = await setPortfolioStrictMode(!s.strictMode)
                setSummary(updated)
              }}
              title={
                summary()?.strictMode
                  ? '当前为严格实盘模式（执行A股交易时间、股票T+1、涨跌停限制）。点击切换为自由沙盒模式。'
                  : '当前为自由沙盒模式（放开交易时段与T+1限制）。点击恢复严格实盘模式。'
              }
            >
              {summary()?.strictMode ? '🛡️ 严格实盘' : '⚡ 自由沙盒'}
            </button>
          </Show>
          <label class="toggle-switch">
            <input
              type="checkbox"
              checked={form.enablePortfolio ?? false}
              onChange={(e) => handleTogglePortfolio(e.currentTarget.checked)}
            />
            <span class="slider" />
          </label>
        </div>
      </div>

      <Show
        when={(summary()?.brokers.length ?? 0) > 0}
        fallback={
          <div class="portfolio-empty-hero">
            <div class="empty-hero-icon">💰</div>
            <div class="empty-hero-title">暂无模拟投资账户</div>
            <div class="empty-hero-desc">
              创建您的首个模拟券商账户，体验同花顺风格实盘复盘、多品种费率核算与仓位管理
            </div>
            <button
              type="button"
              class="hero-create-btn"
              onClick={() => {
                setEditingBroker(null)
                setModalOpen(true)
              }}
            >
              + 创建首个模拟账户
            </button>
          </div>
        }
      >
        <PortfolioStatsGrid
          brokerEquity={brokerEquity()}
          brokerCash={brokerCash()}
          brokerMarketValue={brokerMarketValue()}
          brokerPnl={brokerPnl()}
          brokerTodayPnl={brokerTodayPnl()}
          brokerRatio={brokerRatio()}
          positionCount={currentPositions().length}
          onOpenTransferModal={() => setTransferModalOpen(true)}
        />

        <PortfolioBrokerBar
          brokers={summary()?.brokers ?? []}
          activeBrokerId={summary()?.activeBrokerId ?? ''}
          presetName={presetName()}
          onSwitchBroker={handleSwitchBroker}
          onEditFee={() => {
            setEditingBroker(currentBroker() ?? null)
            setModalOpen(true)
          }}
          onCreateBroker={() => {
            setEditingBroker(null)
            setModalOpen(true)
          }}
          onResetBroker={handleResetBroker}
          onDeleteBroker={handleDeleteBroker}
        />

        <div class="portfolio-table-section">
          <div class="portfolio-subtabs">
            <button
              class={`subtab-btn ${subTab() === 'positions' ? 'active' : ''}`}
              onClick={() => setSubTab('positions')}
            >
              持仓明细 ({currentPositions().length})
            </button>
            <button
              class={`subtab-btn ${subTab() === 'orders' ? 'active' : ''}`}
              onClick={() => setSubTab('orders')}
            >
              排队挂单 ({currentPendingOrders().length})
            </button>
            <button
              class={`subtab-btn ${subTab() === 'trades' ? 'active' : ''}`}
              onClick={() => setSubTab('trades')}
            >
              交易记录 ({currentTrades().length})
            </button>
          </div>

          <Show when={subTab() === 'positions'}>
            <PortfolioPositionsTable positions={currentPositions()} />
          </Show>
          <Show when={subTab() === 'orders'}>
            <PortfolioOrdersTable
              orders={currentPendingOrders()}
              onCancel={handleCancelOrder}
              onCancelAll={handleCancelAllOrders}
              disabled={actionLoading()}
            />
          </Show>
          <Show when={subTab() === 'trades'}>
            <PortfolioTradesTable trades={currentTrades()} />
          </Show>
        </div>
      </Show>

      <PortfolioAccountModal
        isOpen={modalOpen()}
        initialBroker={editingBroker()}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveBrokerModal}
      />
      <PortfolioTransferModal
        isOpen={transferModalOpen()}
        broker={currentBroker() ?? null}
        onClose={() => setTransferModalOpen(false)}
        onTransfer={handleTransferCash}
      />
    </div>
  )
}
