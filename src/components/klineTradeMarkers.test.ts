import { describe, expect, it } from 'vitest'
import { matchTradesToBars } from './klineTradeMarkers'
import type { KLineBar, TradeRecord } from '../types'

describe('klineTradeMarkers: matchTradesToBars', () => {
  const dummyBars: KLineBar[] = [
    {
      date: '2026-11-01',
      open: 20.0,
      close: 20.5,
      high: 21.0,
      low: 19.8,
      volume: 10000,
    },
    {
      date: '2026-11-02',
      open: 20.5,
      close: 21.2,
      high: 21.5,
      low: 20.3,
      volume: 12000,
    },
    {
      date: '2026-11-03',
      open: 21.2,
      close: 23.27,
      high: 23.68,
      low: 22.98,
      volume: 18000,
    },
  ]

  const dummyTrades: TradeRecord[] = [
    {
      id: 't1',
      brokerId: 'b1',
      brokerName: '银河',
      code: 'sh600522',
      name: '中天科技',
      action: 'Buy',
      price: 20.2,
      shares: 100,
      amount: 2020,
      fee: 0.5,
      timestamp: '2026-11-01 09:45:00',
      status: 'Filled',
    },
    {
      id: 't2',
      brokerId: 'b1',
      brokerName: '银河',
      code: 'sh600522',
      name: '中天科技',
      action: 'Sell',
      price: 21.4,
      shares: 100,
      amount: 2140,
      fee: 1.0,
      realizedPnl: 120.0,
      timestamp: '2026-11-02 14:30:00',
      status: 'Filled',
    },
    {
      id: 't3',
      brokerId: 'b1',
      brokerName: '银河',
      code: 'sh600522',
      name: '中天科技',
      action: 'Buy',
      price: 23.27,
      shares: 200,
      amount: 4654,
      fee: 0.5,
      timestamp: '2026-11-03 10:30:00',
      status: 'Filled',
    },
  ]

  it('correctly maps trades to corresponding bar indices', () => {
    const matched = matchTradesToBars(dummyBars, dummyTrades)
    expect(matched.size).toBe(3)

    const bar0Group = matched.get(0)
    expect(bar0Group).toBeDefined()
    expect(bar0Group!.buyCount).toBe(1)
    expect(bar0Group!.sellCount).toBe(0)
    expect(bar0Group!.buyShares).toBe(100)

    const bar1Group = matched.get(1)
    expect(bar1Group).toBeDefined()
    expect(bar1Group!.buyCount).toBe(0)
    expect(bar1Group!.sellCount).toBe(1)
    expect(bar1Group!.realizedPnl).toBe(120.0)

    const bar2Group = matched.get(2)
    expect(bar2Group).toBeDefined()
    expect(bar2Group!.buyCount).toBe(1)
    expect(bar2Group!.buyShares).toBe(200)
    expect(bar2Group!.buyAvgPrice).toBe(23.27)
  })
})
