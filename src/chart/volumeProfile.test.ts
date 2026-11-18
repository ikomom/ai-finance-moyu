import { describe, expect, it } from 'vitest'
import {
  computeVolumeProfile,
  findProfileBinAtPrice,
  getPocRelation,
} from './volumeProfile'
import type { TrendPoint } from '../types'

describe('volumeProfile', () => {
  it('returns null for insufficient or empty points', () => {
    expect(computeVolumeProfile([])).toBeNull()
    expect(computeVolumeProfile([{ time: 930, price: 10, cumVolume: 100, cumAmount: 1000, avgPrice: 10 }])).toBeNull()
  })

  it('correctly calculates volume profile bins and POC', () => {
    // Minute 1: price 10.0, vol 100
    // Minute 2: price 10.5, vol 400 (delta = 300)
    // Minute 3: price 10.5, vol 900 (delta = 500) -> POC should be around 10.5
    // Minute 4: price 11.0, vol 1000 (delta = 100)
    const points: TrendPoint[] = [
      { time: 930, price: 10.0, cumVolume: 100, cumAmount: 1000, avgPrice: 10.0 },
      { time: 931, price: 10.5, cumVolume: 400, cumAmount: 4150, avgPrice: 10.375 },
      { time: 932, price: 10.5, cumVolume: 900, cumAmount: 9400, avgPrice: 10.44 },
      { time: 933, price: 11.0, cumVolume: 1000, cumAmount: 10500, avgPrice: 10.5 },
    ]

    const profile = computeVolumeProfile(points, 10)
    expect(profile).not.toBeNull()
    expect(profile!.totalVolume).toBe(1000)
    expect(profile!.bins.length).toBe(10)

    // POC should be centered near 10.5
    expect(profile!.pocPrice).toBeGreaterThanOrEqual(10.3)
    expect(profile!.pocPrice).toBeLessThanOrEqual(10.7)
    expect(profile!.pocBin.volume).toBe(800) // 300 + 500
    expect(profile!.pocBin.percent).toBe(80)

    // Find bin at price
    const binAtPoc = findProfileBinAtPrice(profile, 10.5)
    expect(binAtPoc).not.toBeNull()
    expect(binAtPoc!.volume).toBe(800)
  })

  it('determines dynamic support / resistance relation accurately', () => {
    // Current price 11.0, POC 10.0 -> support
    const res1 = getPocRelation(11.0, 10.0)
    expect(res1.relation).toBe('support')
    expect(res1.label).toBe('强支撑')
    expect(res1.diffPct).toBe(10)

    // Current price 9.0, POC 10.0 -> resistance
    const res2 = getPocRelation(9.0, 10.0)
    expect(res2.relation).toBe('resistance')
    expect(res2.label).toBe('强压制')
    expect(res2.diffPct).toBe(-10)

    // Current price 10.01, POC 10.0 -> neutral
    const res3 = getPocRelation(10.01, 10.0)
    expect(res3.relation).toBe('neutral')
  })
})
