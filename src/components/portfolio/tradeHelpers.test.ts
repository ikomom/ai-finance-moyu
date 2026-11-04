import { describe, expect, it } from 'vitest'
import { getClearedPnl } from './tradeHelpers'
import type { TradeRecord } from '../../types/portfolio'

describe('getClearedPnl helper', () => {
  it('returns null when trades list is empty or undefined', () => {
    expect(getClearedPnl('sh600000', null)).toBeNull()
    expect(getClearedPnl('sh600000', [])).toBeNull()
  })

  it('returns null when there are no trades for the target code', () => {
    const trades: TradeRecord[] = [
      {
        id: 't1',
        brokerId: 'b1',
        brokerName: '券商',
        code: 'sz000001',
        name: '平安银行',
        action: 'Buy',
        price: 10,
        shares: 1000,
        amount: 10000,
        fee: 5,
        timestamp: '2026-11-04 10:00:00',
        status: 'Filled',
      },
    ]
    expect(getClearedPnl('sh600000', trades)).toBeNull()
  })

  it('computes correct net settled profit for single buy and full sell', () => {
    const trades: TradeRecord[] = [
      {
        id: 't1',
        brokerId: 'b1',
        brokerName: '券商',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Buy',
        price: 10,
        shares: 1000,
        amount: 10000,
        fee: 5,
        timestamp: '2026-11-04 10:00:00',
        status: 'Filled',
      },
      {
        id: 't2',
        brokerId: 'b1',
        brokerName: '券商',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Sell',
        price: 12,
        shares: 1000,
        amount: 12000,
        fee: 9,
        timestamp: '2026-11-04 14:00:00',
        status: 'Filled',
      },
    ]
    // 12000 - 9 = 11991, 10000 + 5 = 10005, pnl = 11991 - 10005 = 1986.00
    expect(getClearedPnl('sh600000', trades)).toBe(1986)
  })

  it('computes net loss for multi-tranche buy and sell', () => {
    const trades: TradeRecord[] = [
      {
        id: 't1',
        brokerId: 'b1',
        brokerName: '券商',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Buy',
        price: 10,
        shares: 500,
        amount: 5000,
        fee: 2.5,
        timestamp: '2026-11-04 09:35:00',
        status: 'Filled',
      },
      {
        id: 't2',
        brokerId: 'b1',
        brokerName: '券商',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Buy',
        price: 12,
        shares: 500,
        amount: 6000,
        fee: 3,
        timestamp: '2026-11-04 10:30:00',
        status: 'Filled',
      },
      {
        id: 't3',
        brokerId: 'b1',
        brokerName: '券商',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Sell',
        price: 9,
        shares: 1000,
        amount: 9000,
        fee: 4.5,
        timestamp: '2026-11-04 14:30:00',
        status: 'Filled',
      },
    ]
    // Buy cost = 5002.5 + 6003 = 11005.5
    // Sell proceeds = 9000 - 4.5 = 8995.5
    // PnL = 8995.5 - 11005.5 = -2010.00
    expect(getClearedPnl('sh600000', trades)).toBe(-2010)
  })

  it('ignores pending or cancelled orders and respects brokerId filter', () => {
    const trades: TradeRecord[] = [
      {
        id: 't1',
        brokerId: 'b1',
        brokerName: '券商1',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Buy',
        price: 10,
        shares: 1000,
        amount: 10000,
        fee: 5,
        timestamp: '2026-11-04 09:35:00',
        status: 'Filled',
      },
      {
        id: 't2',
        brokerId: 'b1',
        brokerName: '券商1',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Sell',
        price: 15,
        shares: 1000,
        amount: 15000,
        fee: 0,
        timestamp: '2026-11-04 10:00:00',
        status: 'Cancelled', // should be ignored!
      },
      {
        id: 't3',
        brokerId: 'b2',
        brokerName: '券商2',
        code: 'sh600000',
        name: '浦发银行',
        action: 'Sell',
        price: 12,
        shares: 1000,
        amount: 12000,
        fee: 6,
        timestamp: '2026-11-04 14:00:00',
        status: 'Filled',
      },
    ]

    // Scoped to b1: only has buy (10005 cost, 0 proceeds) -> -10005
    expect(getClearedPnl('sh600000', trades, 'b1')).toBe(-10005)
    // Scoped to b2: only has sell (11994 proceeds, 0 buy cost) -> 11994
    expect(getClearedPnl('sh600000', trades, 'b2')).toBe(11994)
  })
})
