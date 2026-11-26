import { describe, expect, it } from 'vitest'
import { buildHistoricalTapeQuote } from './historicalTape'
import type { DayTrend, KLineData, Quote } from '../../types'

const livePreMarketQuote: Quote = {
  code: 'sh603703',
  name: '盛洋科技',
  price: 8.1,
  preClose: 8.1,
  open: 0,
  high: 0,
  low: 0,
  volume: 0,
  change: 0,
  changePct: 0,
  date: '20261126',
  time: '092700',
  circulatingMarketCap: 34.86,
  weibi: -12.3,
  outerVol: 0,
  innerVol: 0,
  turnoverRate: 0,
  amount: 0,
  volumeRatio: 0,
  amplitude: 0,
}

const drillDay: DayTrend = {
  date: '20261120',
  preClose: 8.1,
  points: [
    { time: 930, price: 8.07, cumVolume: 1200, cumAmount: 968400, avgPrice: 8.07 },
    { time: 1030, price: 7.82, cumVolume: 52000, cumAmount: 40820000, avgPrice: 7.85 },
    { time: 1500, price: 7.55, cumVolume: 110000, cumAmount: 85360000, avgPrice: 7.76 },
  ],
}

const kline: KLineData = {
  code: 'sh603703',
  maSignal: 'neutral',
  maComment: '',
  bars: [
    { date: '2026-11-13', open: 8.0, close: 8.05, high: 8.1, low: 7.9, volume: 90000 },
    { date: '2026-11-16', open: 8.05, close: 8.0, high: 8.12, low: 7.95, volume: 100000 },
    { date: '2026-11-17', open: 8.0, close: 8.1, high: 8.15, low: 7.98, volume: 80000 },
    { date: '2026-11-18', open: 8.1, close: 8.08, high: 8.2, low: 8.0, volume: 110000 },
    { date: '2026-11-19', open: 8.08, close: 8.1, high: 8.16, low: 8.02, volume: 120000 },
    { date: '2026-11-20', open: 8.07, close: 7.55, high: 8.07, low: 7.55, volume: 110000 },
  ],
}

describe('buildHistoricalTapeQuote', () => {
  it('replaces unopened live quote metrics with historical day OHLC, amount, turnover, amplitude, and volumeRatio', () => {
    const res = buildHistoricalTapeQuote({
      quote: livePreMarketQuote,
      drillDay,
      kline,
      klinePeriod: 'day',
    })

    expect(res.historicalDate).toBe('2026-11-20')
    expect(res.quote.open).toBe(8.07)
    expect(res.quote.high).toBe(8.07)
    expect(res.quote.low).toBe(7.55)
    expect(res.quote.price).toBe(7.55)
    expect(res.quote.preClose).toBe(8.1)
    expect(res.quote.avgPrice).toBeCloseTo(7.76, 2)
    expect(res.quote.amount).toBe(85360000)
    expect(res.quote.amplitude).toBeCloseTo(((8.07 - 7.55) / 8.1) * 100, 4)
    expect(res.quote.turnoverRate).toBeCloseTo((11000000 / ((34.86 * 1e8) / 8.1)) * 100, 4)
    // Prior 5-day avg volume = (90k+100k+80k+110k+120k)/5 = 100k -> 110k / 100k = 1.10
    expect(res.quote.volumeRatio).toBeCloseTo(1.1, 4)
    // Historical market cap scaled to closing price 7.55
    expect(res.quote.circulatingMarketCap).toBeCloseTo((34.86 * 7.55) / 8.1, 2)
    // Live-only order book fields must be cleared
    expect(res.quote.weibi).toBeUndefined()
    expect(res.quote.outerVol).toBe(0)
    expect(res.quote.innerVol).toBe(0)
  })

  it('gracefully leaves volumeRatio undefined when daily K-line bars are unavailable or period is non-day', () => {
    const res = buildHistoricalTapeQuote({
      quote: livePreMarketQuote,
      drillDay,
      kline,
      klinePeriod: '60m',
    })

    expect(res.quote.volumeRatio).toBeUndefined()
    expect(res.quote.open).toBe(8.07)
    expect(res.quote.amount).toBe(85360000)
  })
})
