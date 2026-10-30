import { describe, expect, it, vi } from 'vitest'
import { FEE_PRESETS } from '../types/portfolio'
import {
  cancelAllSimulatedOrders,
  cancelSimulatedOrder,
  clearAllPortfolio,
  createBrokerAccount,
  deleteBrokerAccount,
  executeSimulatedTrade,
  getPortfolioSummary,
  resetBrokerAccount,
  resetPortfolioPosition,
  setActiveBroker,
  setPortfolioStrictMode,
  transferBrokerCash,
  updateBrokerAccount,
} from './portfolio'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === 'get_portfolio_summary') {
      return {
        activeBrokerId: 'default',
        brokers: [],
        positions: [],
        trades: [],
        totalMarketValue: 0,
        totalCash: 100000,
        totalEquity: 100000,
        totalPnl: 0,
        totalPnlPct: 0,
        todayPnl: 0,
        positionRatio: 0,
      }
    }
    return { cmd, args }
  }),
}))

describe('Portfolio Service & Presets', () => {
  it('has built-in fee presets including vip_low, preferential, standard, zero', () => {
    expect(FEE_PRESETS.length).toBe(4)
    const vip = FEE_PRESETS.find((p) => p.id === 'vip_low')!
    expect(vip).toBeDefined()
    expect(vip.name).toContain('万0.954')
    expect(vip.config.stockRate).toBeCloseTo(0.0000954)
    expect(vip.config.stockMinFee).toBe(0.5)
    expect(vip.config.etfRate).toBeCloseTo(0.00005)
    expect(vip.config.etfMinFee).toBe(0.25)
    expect(vip.config.bondRate).toBeCloseTo(0.00005)
    expect(vip.config.bondMinFee).toBe(0.5)
    expect(vip.config.stampDutyRate).toBe(0.0005)

    const standard = FEE_PRESETS.find((p) => p.id === 'standard')!
    expect(standard.config.stockRate).toBe(0.00025)
    expect(standard.config.stockMinFee).toBe(5.0)
    expect(standard.config.bondMinFee).toBe(1.0)

    const zero = FEE_PRESETS.find((p) => p.id === 'zero')!
    expect(zero.config.stockRate).toBe(0)
    expect(zero.config.stampDutyRate).toBe(0)
  })

  it('invokes backend portfolio commands correctly', async () => {
    const summary = await getPortfolioSummary()
    expect(summary.activeBrokerId).toBe('default')
    expect(summary.totalCash).toBe(100000)

    const tradeRes: any = await executeSimulatedTrade({
      brokerId: 'b1',
      code: 'sh600000',
      name: '浦发银行',
      action: 'Buy',
      shares: 1000,
      price: 10.0,
    })
    expect(tradeRes.cmd).toBe('execute_simulated_trade')
    expect(tradeRes.args.order.shares).toBe(1000)

    const createRes: any = await createBrokerAccount('银河证券', 200000, {
      preset: 'vip_low',
      stockRate: 0.0000954,
      stockMinFee: 0.5,
      etfRate: 0.00005,
      etfMinFee: 0.25,
      bondRate: 0.00005,
      stampDutyRate: 0.0005,
    })
    expect(createRes.cmd).toBe('create_broker_account')
    expect(createRes.args.name).toBe('银河证券')

    const updateRes: any = await updateBrokerAccount({
      id: 'b1',
      name: '招商证券',
      initialCash: 150000,
      availableCash: 150000,
      feeConfig: {} as any,
      createdAt: '2026-10-29',
    })
    expect(updateRes.cmd).toBe('update_broker_account')

    const resetBrokerRes: any = await resetBrokerAccount('b1')
    expect(resetBrokerRes.cmd).toBe('reset_broker_account')

    const resetPosRes: any = await resetPortfolioPosition('b1', 'sh600000')
    expect(resetPosRes.cmd).toBe('reset_portfolio_position')

    const setActiveRes: any = await setActiveBroker('b1')
    expect(setActiveRes.cmd).toBe('set_active_broker')

    const transferRes: any = await transferBrokerCash('b1', 50000, true)
    expect(transferRes.cmd).toBe('transfer_broker_cash')
    expect(transferRes.args.amount).toBe(50000)
    expect(transferRes.args.isDeposit).toBe(true)

    const strictRes: any = await setPortfolioStrictMode(true)
    expect(strictRes.cmd).toBe('set_portfolio_strict_mode')
    expect(strictRes.args.strictMode).toBe(true)

    const clearRes: any = await clearAllPortfolio()
    expect(clearRes.cmd).toBe('clear_all_portfolio')

    const cancelRes: any = await cancelSimulatedOrder('order_123')
    expect(cancelRes.cmd).toBe('cancel_simulated_order')
    expect(cancelRes.args.orderId).toBe('order_123')

    const cancelAllRes: any = await cancelAllSimulatedOrders('b1')
    expect(cancelAllRes.cmd).toBe('cancel_all_simulated_orders')
    expect(cancelAllRes.args.brokerId).toBe('b1')

    const deleteRes: any = await deleteBrokerAccount('b1')
    expect(deleteRes.cmd).toBe('delete_broker_account')
  })

  it('correctly calculates sell/buy share ratios with T+1 availability', async () => {
    const { computeSharesByRatio, getAvailableSellShares } = await import('../components/portfolio/tradeHelpers')

    // T+1: bought today, availableShares is 0
    const posLocked: any = { shares: 200, availableShares: 0 }
    expect(getAvailableSellShares(posLocked, true)).toBe(0)
    expect(computeSharesByRatio('Sell', 1.0, 100000, 10.0, posLocked, true)).toBe(0)
    expect(computeSharesByRatio('Sell', 0.5, 100000, 10.0, posLocked, true)).toBe(0)

    // T+1: 500 shares, 300 available
    const posPartial: any = { shares: 500, availableShares: 300 }
    expect(getAvailableSellShares(posPartial, true)).toBe(300)
    expect(computeSharesByRatio('Sell', 1.0, 100000, 10.0, posPartial, true)).toBe(300)
    expect(computeSharesByRatio('Sell', 0.5, 100000, 10.0, posPartial, true)).toBe(100)

    // Buy: insufficient cash for 1 lot (100 shares) returns 0 instead of forcing 100
    expect(computeSharesByRatio('Buy', 1.0, 50, 10.0)).toBe(0)
    // Buy: cash enough for 200 shares
    expect(computeSharesByRatio('Buy', 1.0, 2500, 10.0)).toBe(200)
  })
})
