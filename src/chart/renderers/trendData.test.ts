import { describe, expect, it } from 'vitest'
import { buildUnifiedChartData } from './trendData'
import type { DrawOptions } from '../types'

const identityX = (slot: number) => slot

describe('buildUnifiedChartData', () => {
  it('does not bridge 09:25 morning auction straight to 15:00 closing auction when continuous trend is empty', () => {
    const opts: DrawOptions = {
      preClose: 5.68,
      lastPrice: 5.84,
      trend: { code: 'sz000592', date: '20261126', preClose: 5.68, points: [] },
      auction: {
        code: 'sz000592',
        date: '20261126',
        points: [
          { time: 91500, rawTime: '09:15:00', price: 5.7, volume: 100, unmatchedSide: 'none' },
          { time: 92500, rawTime: '09:25:00', price: 5.68, volume: 200, unmatchedSide: 'none' },
        ],
        closingPoints: [
          { time: 150000, rawTime: '15:00:00', price: 5.84, volume: 500, unmatchedSide: 'none' },
        ],
      },
    }
    const { pricePoints } = buildUnifiedChartData(opts, identityX, true)
    expect(pricePoints.map((p) => p.slot)).toEqual([0, 10])
  })

  it('keeps full spectrum when morning auction, continuous points, and closing auction are all present', () => {
    const opts: DrawOptions = {
      preClose: 5.68,
      lastPrice: 5.84,
      trend: {
        code: 'sz000592',
        date: '20261126',
        preClose: 5.68,
        points: [
          { time: 930, price: 5.68, cumVolume: 100, cumAmount: 56800, avgPrice: 5.68 },
          { time: 1456, price: 5.83, cumVolume: 900, cumAmount: 520000, avgPrice: 5.77 },
        ],
      },
      auction: {
        code: 'sz000592',
        date: '20261126',
        points: [
          { time: 92500, rawTime: '09:25:00', price: 5.68, volume: 200, unmatchedSide: 'none' },
        ],
        closingPoints: [
          { time: 150000, rawTime: '15:00:00', price: 5.84, volume: 500, unmatchedSide: 'none' },
        ],
      },
    }
    const { pricePoints } = buildUnifiedChartData(opts, identityX, true)
    expect(pricePoints.map((p) => p.slot)).toEqual([10, 15, 15, 251, 255])
  })
})
