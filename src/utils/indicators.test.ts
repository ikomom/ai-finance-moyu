import { describe, expect, it } from 'vitest'

import {
  computeKLineKdj,
  computeKLineLevels,
  computeKLineMacd,
  computeKLineMovingAverages,
  computeMinuteMacd,
} from './indicators'
import type { KLineBar, TrendPoint } from '../types'

function bars(closes: number[]): KLineBar[] {
  return closes.map((close, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    ma5: null,
    ma10: null,
    ma20: null,
    dif: null,
    dea: null,
    macd: null,
  }))
}

function points(prices: number[]): TrendPoint[] {
  return prices.map((price, i) => ({
    time: 930 + i,
    price,
    cumVolume: (i + 1) * 100,
    cumAmount: (i + 1) * 100 * price,
    avgPrice: price,
  }))
}

describe('moving averages', () => {
  it('leaves MA undefined until enough history exists', () => {
    const b = bars([10, 11, 12])
    computeKLineMovingAverages(b)
    expect(b[0].ma5).toBeNull()
    expect(b[3 - 1].ma5).toBeNull()
  })

  it('computes a simple average once the window is full', () => {
    const b = bars([10, 11, 12, 13, 14])
    computeKLineMovingAverages(b)
    // (10+11+12+13+14)/5 = 12
    expect(b[4].ma5).toBe(12)
    expect(b[4].ma10).toBeNull()
  })

  it('honours custom periods', () => {
    const b = bars([10, 20])
    computeKLineMovingAverages(b, [2, 3, 4])
    expect(b[1].ma5).toBe(15)
  })
})

describe('kline MACD', () => {
  it('starts at zero and is stable on a flat series', () => {
    const b = bars([10, 10, 10, 10])
    computeKLineMacd(b)
    expect(b[0].dif).toBe(0)
    for (const bar of b) {
      expect(bar.dif).toBeCloseTo(0, 6)
      expect(bar.macd).toBeCloseTo(0, 6)
    }
  })

  it('turns positive on a rising series', () => {
    const b = bars([10, 11, 12, 13, 14, 15])
    computeKLineMacd(b)
    expect(b[b.length - 1].dif!).toBeGreaterThan(0)
  })

  it('is a no-op on an empty series', () => {
    const b: KLineBar[] = []
    expect(() => computeKLineMacd(b)).not.toThrow()
  })
})

describe('minute MACD', () => {
  it('returns one entry per input point', () => {
    const res = computeMinuteMacd(points([10, 10.5, 11]))
    expect(res).toHaveLength(3)
    expect(res[0]).toEqual({ dif: 0, dea: 0, macd: 0 })
  })

  it('returns an empty array for no data', () => {
    expect(computeMinuteMacd([])).toEqual([])
  })
})

describe('kline KDJ and levels', () => {
  it('computes rolling KDJ values', () => {
    const b = bars([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    computeKLineKdj(b)
    expect(b[0].k).toBe(50)
    expect(b[9].k).toBeDefined()
    expect(b[9].j).toBeGreaterThan(50)
  })

  it('computes rolling 5-day support and resistance', () => {
    const b = bars([10, 12, 14, 16, 18, 15, 17])
    const levels = computeKLineLevels(b)
    expect(levels.support).toBeDefined()
    expect(levels.resistance).toBeDefined()
    expect(levels.resistance).toBe(18)
    expect(levels.support).toBe(12)
  })
})
