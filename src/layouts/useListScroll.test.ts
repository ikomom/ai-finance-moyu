// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { computeTotalStats } from './useListScroll'
import type { Quote, WatchItem } from '../types'

describe('computeTotalStats', () => {
  const quotes: Quote[] = [
    {
      code: 'sh600000',
      name: '浦发银行',
      price: 10.2,
      preClose: 10.0,
      open: 10.0,
      high: 10.3,
      low: 9.9,
      volume: 100000,
      change: 0.2,
      changePct: 2.0,
      date: '20260320',
      time: '10:00:00',
      bids: [],
      asks: [],
    },
    {
      code: 'sz000001',
      name: '平安银行',
      price: 12.0,
      preClose: 12.5,
      open: 12.4,
      high: 12.6,
      low: 11.9,
      volume: 80000,
      change: -0.5,
      changePct: -4.0,
      date: '20260320',
      time: '10:00:00',
      bids: [],
      asks: [],
    },
  ]

  const watchlist: WatchItem[] = [
    { code: 'sh600000', costPrice: 9.5, shares: 1000, priceLines: [] },
    { code: 'sz000001', costPrice: 13.0, shares: 500, priceLines: [] },
  ]

  it('calculates total today, total floating, and percentage accurately', () => {
    // sh600000: today (10.2 - 10.0) * 1000 = +200, floating (10.2 - 9.5) * 1000 = +700, cost = 9500
    // sz000001: today (12.0 - 12.5) * 500 = -250, floating (12.0 - 13.0) * 500 = -500, cost = 6500
    // totalToday = 200 - 250 = -50
    // totalFloating = 700 - 500 = +200
    // totalCost = 9500 + 6500 = 16000
    // floatingPct = (200 / 16000) * 100 = 1.25%
    const stats = computeTotalStats(quotes, watchlist)
    expect(stats).not.toBeNull()
    expect(stats!.totalToday).toBeCloseTo(-50, 1)
    expect(stats!.totalFloating).toBeCloseTo(200, 1)
    expect(stats!.floatingPct).toBeCloseTo(1.25, 2)
  })

  it('returns null when no positions have shares', () => {
    const noSharesWatchlist: WatchItem[] = [
      { code: 'sh600000', costPrice: 9.5, shares: 0, priceLines: [] },
      { code: 'sz000001', costPrice: 13.0, priceLines: [] },
    ]
    const stats = computeTotalStats(quotes, noSharesWatchlist)
    expect(stats).toBeNull()
  })

  it('returns null on empty quotes or watchlist', () => {
    expect(computeTotalStats([], watchlist)).toBeNull()
    expect(computeTotalStats(quotes, [])).toBeNull()
  })
})
