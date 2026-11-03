import { describe, expect, it } from 'vitest'
import { groupIntradayTrades } from './tradePointsRenderer'
import type { TradeRecord } from '../../types/portfolio'

describe('tradePointsRenderer: groupIntradayTrades', () => {
  const dummyTrades: TradeRecord[] = [
    {
      id: 't1',
      brokerId: 'b1',
      brokerName: '银河',
      code: 'sh600522',
      name: '中天科技',
      action: 'Buy',
      price: 23.27,
      shares: 100,
      amount: 2327,
      fee: 0.5,
      timestamp: '2026-11-03 09:35:12',
      status: 'Filled',
    },
    {
      id: 't2',
      brokerId: 'b1',
      brokerName: '银河',
      code: 'sh600522',
      name: '中天科技',
      action: 'Buy',
      price: 23.35,
      shares: 100,
      amount: 2335,
      fee: 0.5,
      timestamp: '2026-11-03 09:35:45',
      status: 'Filled',
    },
    {
      id: 't3',
      brokerId: 'b1',
      brokerName: '银河',
      code: 'sh600522',
      name: '中天科技',
      action: 'Sell',
      price: 23.50,
      shares: 100,
      amount: 2350,
      fee: 1.5,
      realizedPnl: 23.0,
      timestamp: '2026-11-03 14:00:20',
      status: 'Filled',
    },
    {
      id: 't4_other_day',
      brokerId: 'b1',
      brokerName: '银河',
      code: 'sh600522',
      name: '中天科技',
      action: 'Buy',
      price: 22.00,
      shares: 100,
      amount: 2200,
      fee: 0.5,
      timestamp: '2026-11-02 10:00:00',
      status: 'Filled',
    },
  ]

  it('filters trades by targetDate and groups by slot', () => {
    const groups = groupIntradayTrades(dummyTrades, '2026-11-03', false)
    expect(groups.length).toBe(2)

    const morningGroup = groups.find((g) => g.buyCount === 2)
    expect(morningGroup).toBeDefined()
    expect(morningGroup!.type).toBe('B')
    expect(morningGroup!.buyShares).toBe(200)
    expect(morningGroup!.avgPrice).toBeCloseTo(23.31, 2)

    const afternoonGroup = groups.find((g) => g.type === 'S')
    expect(afternoonGroup).toBeDefined()
    expect(afternoonGroup!.type).toBe('S')
    expect(afternoonGroup!.sellShares).toBe(100)
    expect(afternoonGroup!.realizedPnl).toBe(23.0)
  })

  it('identifies T (T+0 or intraday buy & sell) on same slot', () => {
    const tTrades: TradeRecord[] = [
      {
        id: 't1',
        brokerId: 'b1',
        brokerName: '银河',
        code: 'sh600522',
        name: '中天科技',
        action: 'Buy',
        price: 23.0,
        shares: 100,
        amount: 2300,
        fee: 0.5,
        timestamp: '2026-11-03 10:00:10',
        status: 'Filled',
      },
      {
        id: 't2',
        brokerId: 'b1',
        brokerName: '银河',
        code: 'sh600522',
        name: '中天科技',
        action: 'Sell',
        price: 23.4,
        shares: 100,
        amount: 2340,
        fee: 1.5,
        timestamp: '2026-11-03 10:00:50',
        status: 'Filled',
      },
    ]

    const groups = groupIntradayTrades(tTrades, '2026-11-03', false)
    expect(groups.length).toBe(1)
    expect(groups[0].type).toBe('T')
  })
})
