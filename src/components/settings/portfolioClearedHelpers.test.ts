import { describe, expect, it } from 'vitest'
import {
  computeClearedPositions,
  computeClearedSummary,
  sortClearedPositions,
} from './portfolioClearedHelpers'
import type { PositionView, TradeRecord } from '../../types/portfolio'

describe('portfolioClearedHelpers', () => {
  const mockTrades: TradeRecord[] = [
    // Stock 1: sh600000 - completely cleared, profitable
    {
      id: 't1',
      brokerId: 'b1',
      brokerName: '测试券商',
      code: 'sh600000',
      name: '浦发银行',
      action: 'Buy',
      price: 10,
      shares: 1000,
      amount: 10000,
      fee: 5,
      timestamp: '2026-11-01 10:00:00',
      status: 'Filled',
    },
    {
      id: 't2',
      brokerId: 'b1',
      brokerName: '测试券商',
      code: 'sh600000',
      name: '浦发银行',
      action: 'Sell',
      price: 12,
      shares: 1000,
      amount: 12000,
      fee: 9,
      timestamp: '2026-11-02 14:00:00',
      status: 'Filled',
    },
    // Stock 2: sz000001 - completely cleared, loss
    {
      id: 't3',
      brokerId: 'b1',
      brokerName: '测试券商',
      code: 'sz000001',
      name: '平安银行',
      action: 'Buy',
      price: 15,
      shares: 500,
      amount: 7500,
      fee: 3,
      timestamp: '2026-11-03 09:30:00',
      status: 'Filled',
    },
    {
      id: 't4',
      brokerId: 'b1',
      brokerName: '测试券商',
      code: 'sz000001',
      name: '平安银行',
      action: 'Sell',
      price: 14,
      shares: 500,
      amount: 7000,
      fee: 6.5,
      timestamp: '2026-11-04 11:00:00',
      status: 'Filled',
    },
    // Stock 3: sz300750 - currently still OPEN (held 100 shares)
    {
      id: 't5',
      brokerId: 'b1',
      brokerName: '测试券商',
      code: 'sz300750',
      name: '宁德时代',
      action: 'Buy',
      price: 200,
      shares: 200,
      amount: 40000,
      fee: 10,
      timestamp: '2026-11-01 11:00:00',
      status: 'Filled',
    },
    {
      id: 't6',
      brokerId: 'b1',
      brokerName: '测试券商',
      code: 'sz300750',
      name: '宁德时代',
      action: 'Sell',
      price: 220,
      shares: 100,
      amount: 22000,
      fee: 15,
      timestamp: '2026-11-02 10:00:00',
      status: 'Filled',
    },
  ]

  const openPositions: PositionView[] = [
    {
      brokerId: 'b1',
      brokerName: '测试券商',
      code: 'sz300750',
      name: '宁德时代',
      shares: 100, // Still open!
      availableShares: 100,
      costPrice: 180,
      currentPrice: 210,
      marketValue: 21000,
      floatingPnl: 3000,
      floatingPnlPct: 16.67,
      todayPnl: 0,
      updatedAt: '2026-11-02 10:00:00',
    },
  ]

  it('filters out currently open positions and only aggregates cleared stocks', () => {
    const cleared = computeClearedPositions(mockTrades, openPositions, 'b1')
    expect(cleared.length).toBe(2)

    const codes = cleared.map((c) => c.code)
    expect(codes).toContain('sh600000')
    expect(codes).toContain('sz000001')
    expect(codes).not.toContain('sz300750') // open position must NOT be in cleared
  })

  it('computes accurate profit, loss and return percentage', () => {
    const cleared = computeClearedPositions(mockTrades, openPositions, 'b1')
    const pufa = cleared.find((c) => c.code === 'sh600000')!
    expect(pufa.totalBuyAmount).toBe(10005)
    expect(pufa.totalSellProceeds).toBe(11991)
    expect(pufa.realizedPnl).toBe(1986)
    expect(pufa.realizedPct).toBe(19.85)
    expect(pufa.buyTradesCount).toBe(1)
    expect(pufa.sellTradesCount).toBe(1)
    expect(pufa.totalFee).toBe(14)
    expect(pufa.clearedAt).toBe('2026-11-02 14:00:00')

    const pingan = cleared.find((c) => c.code === 'sz000001')!
    expect(pingan.totalBuyAmount).toBe(7503)
    expect(pingan.totalSellProceeds).toBe(6993.5)
    expect(pingan.realizedPnl).toBe(-509.5)
    expect(pingan.realizedPct).toBe(-6.79)
  })

  it('computes summary statistics and win rate accurately', () => {
    const cleared = computeClearedPositions(mockTrades, openPositions, 'b1')
    const stats = computeClearedSummary(cleared)

    expect(stats.totalCount).toBe(2)
    expect(stats.winCount).toBe(1)
    expect(stats.lossCount).toBe(1)
    expect(stats.winRate).toBe(50.0)
    expect(stats.totalRealizedPnl).toBe(1476.5) // 1986 - 509.5 = 1476.5
    expect(stats.totalFee).toBe(23.5) // 14 + 9.5 = 23.5
  })

  it('sorts cleared positions by pnl, pct and time in both directions', () => {
    const cleared = computeClearedPositions(mockTrades, openPositions, 'b1')

    const byPnlDesc = sortClearedPositions(cleared, 'pnl', 'desc')
    expect(byPnlDesc[0].code).toBe('sh600000') // 1986 > -509.5

    const byPnlAsc = sortClearedPositions(cleared, 'pnl', 'asc')
    expect(byPnlAsc[0].code).toBe('sz000001')

    const byTimeDesc = sortClearedPositions(cleared, 'time', 'desc')
    expect(byTimeDesc[0].code).toBe('sz000001') // 2026-11-04 > 2026-11-02
  })
})
