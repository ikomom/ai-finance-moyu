import { describe, expect, it } from 'vitest'

import {
  AUCTION_SLOTS,
  MORNING_END,
  MORNING_START,
  SLOTS,
  clamp,
  createLinearScale,
  createSymmetricScale,
  isValidAvg,
  slotOf,
  slotOfAuctionTime,
} from './scale'

describe('clamp', () => {
  it('bounds the value on both sides', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('intraday slot mapping', () => {
  // `slotOf` takes an HHMM integer (0930, 1130, 1500), not minutes-of-day.
  it('maps the session open to the first slot', () => {
    expect(slotOf(930)).toBe(0)
    expect(MORNING_START).toBe(570)
  })

  it('maps the morning close to slot 120', () => {
    expect(slotOf(1130)).toBe(120)
    expect(MORNING_END).toBe(690)
  })

  it('collapses the lunch break so 13:00 continues at slot 120', () => {
    expect(slotOf(1300)).toBe(120)
    expect(slotOf(1301)).toBe(121)
  })

  it('maps 15:00 to the last slot', () => {
    expect(slotOf(1500)).toBe(SLOTS)
  })

  it('clamps anything outside the session into range', () => {
    expect(slotOf(0)).toBe(0)
    expect(slotOf(2300)).toBe(SLOTS)
  })
})

describe('auction slot mapping', () => {
  it('spans 09:15 to 09:25', () => {
    expect(slotOfAuctionTime(915)).toBe(0)
    expect(slotOfAuctionTime(920)).toBe(5)
    expect(slotOfAuctionTime(925)).toBe(AUCTION_SLOTS)
  })

  it('clamps outside the auction window', () => {
    expect(slotOfAuctionTime(800)).toBe(0)
    expect(slotOfAuctionTime(1000)).toBe(AUCTION_SLOTS)
  })
})

describe('average price validity', () => {
  it('rejects an average that is not a plausible price', () => {
    expect(isValidAvg(0, 10)).toBe(false)
    expect(isValidAvg(-1, 10)).toBe(false)
    expect(isValidAvg(10, 10)).toBe(true)
  })

  it('rejects an average more than 30% away from pre-close', () => {
    expect(isValidAvg(14, 10)).toBe(false)
    expect(isValidAvg(12.9, 10)).toBe(true)
  })
})

describe('linear scale', () => {
  it('projects the domain onto the range', () => {
    const s = createLinearScale([0, 10], [0, 100])
    expect(s(0)).toBe(0)
    expect(s(5)).toBe(50)
    expect(s(10)).toBe(100)
  })

  it('does not divide by zero on a degenerate domain', () => {
    const s = createLinearScale([5, 5], [0, 100])
    expect(Number.isFinite(s(5))).toBe(true)
  })
})

describe('symmetric scale', () => {
  // `maxDev` is an absolute price deviation, not a fraction.
  const scale = createSymmetricScale(10, 0.5, 0, 200)

  it('places pre_close in the middle of the plot', () => {
    expect(scale(10)).toBeCloseTo(100, 5)
  })

  it('maps the ±maxDev bounds to the plot edges', () => {
    expect(scale(10.5)).toBeCloseTo(0, 5)
    expect(scale(9.5)).toBeCloseTo(200, 5)
  })
})
