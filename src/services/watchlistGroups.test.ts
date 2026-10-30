import { describe, expect, it } from 'vitest'
import {
  ALL_GROUP_ID,
  computeGroupCounts,
  DEFAULT_GROUP_ID,
  filterQuotesByGroup,
  filterWatchlistByGroup,
} from './watchlistGroups'
import type { Quote, WatchGroup, WatchItem } from '../types'

describe('watchlistGroups services & utilities', () => {
  const groups: WatchGroup[] = [
    { id: DEFAULT_GROUP_ID, name: '默认自选' },
    { id: 'tech', name: '科技股' },
  ]

  const items: WatchItem[] = [
    { code: 'sh600000', name: '浦发银行', group: DEFAULT_GROUP_ID },
    { code: 'sz300750', name: '宁德时代', group: 'tech' },
    { code: 'sz002428', name: '鲁银投资' }, // missing group defaults to default
  ]

  const quotes: Quote[] = [
    { code: 'sh600000', name: '浦发银行', price: 10, change: 0, changePct: 0, open: 10, high: 10, low: 10, preClose: 10, volume: 100, date: '2026-10-30', time: '15:00:00' },
    { code: 'sz300750', name: '宁德时代', price: 200, change: 0, changePct: 0, open: 200, high: 200, low: 200, preClose: 200, volume: 100, date: '2026-10-30', time: '15:00:00' },
    { code: 'sz002428', name: '鲁银投资', price: 6, change: 0, changePct: 0, open: 6, high: 6, low: 6, preClose: 6, volume: 100, date: '2026-10-30', time: '15:00:00' },
  ]

  it('filters watchlist items by group correctly', () => {
    expect(filterWatchlistByGroup(items, ALL_GROUP_ID)).toHaveLength(3)
    expect(filterWatchlistByGroup(items, null)).toHaveLength(3)
    expect(filterWatchlistByGroup(items, 'tech')).toHaveLength(1)
    expect(filterWatchlistByGroup(items, 'tech')[0].code).toBe('sz300750')
    expect(filterWatchlistByGroup(items, DEFAULT_GROUP_ID)).toHaveLength(2)
  })

  it('filters quotes based on items in active group', () => {
    expect(filterQuotesByGroup(quotes, items, 'tech')).toHaveLength(1)
    expect(filterQuotesByGroup(quotes, items, 'tech')[0].code).toBe('sz300750')
    expect(filterQuotesByGroup(quotes, items, DEFAULT_GROUP_ID)).toHaveLength(2)
    expect(filterQuotesByGroup(quotes, items, ALL_GROUP_ID)).toHaveLength(3)
  })

  it('computes stock counts per group', () => {
    const counts = computeGroupCounts(items, groups)
    expect(counts[ALL_GROUP_ID]).toBe(3)
    expect(counts[DEFAULT_GROUP_ID]).toBe(2)
    expect(counts['tech']).toBe(1)
  })
})
