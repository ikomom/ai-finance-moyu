export const MORNING_START = 9 * 60 + 30 // 09:30
export const MORNING_END = 11 * 60 + 30 // 11:30
export const AFTERNOON_START = 13 * 60 // 13:00
export const SLOTS = 240 // 241 points: indices 0..240

export const AUCTION_START_MIN = 9 * 60 + 15 // 09:15
export const AUCTION_SLOTS = 10 // 09:15 to 09:25 is 10 minutes

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function isValidAvg(avgPrice: number, preClose: number): boolean {
  if (!avgPrice || avgPrice <= 0 || !Number.isFinite(avgPrice)) return false
  if (preClose > 0 && Math.abs(avgPrice - preClose) > preClose * 0.3) return false
  return true
}

/**
 * Map an `HHMM` stamp onto its x slot (0..240).
 *
 * The lunch break is collapsed: 09:30 is slot 0, 11:30 is slot 120, and the
 * afternoon picks up at slot 121 with 13:01. Anything outside the session
 * clamps to an end so a stray pre-open print can't stretch the axis.
 */
export function slotOf(hhmm: number): number {
  const h = Math.floor(hhmm / 100)
  const m = hhmm % 100
  const min = h * 60 + m
  if (min <= MORNING_END) {
    return clamp(min - MORNING_START, 0, 120)
  }
  if (min < AFTERNOON_START) {
    return 120
  }
  return clamp(min - 660, 120, SLOTS)
}

/**
 * Map auction time (09:15-09:25) onto slot index 0..10.
 */
export function slotOfAuctionTime(hhmm: number): number {
  const h = Math.floor(hhmm / 100)
  const m = hhmm % 100
  const totalMin = h * 60 + m
  const diff = totalMin - AUCTION_START_MIN
  return Math.min(AUCTION_SLOTS, Math.max(0, diff))
}

/**
 * Pure linear projection: map a value from [domainMin, domainMax] to [rangeMin, rangeMax].
 */
export function createLinearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (val: number) => r0 + ((val - d0) / span) * (r1 - r0)
}

/**
 * Pure symmetric scale centered around preClose:
 * Maps price to Y coordinate in [plotTop, plotTop + plotHeight].
 */
export function createSymmetricScale(preClose: number, maxDev: number, plotTop: number, plotHeight: number) {
  const yMin = preClose - maxDev
  const span = maxDev * 2 || 1
  return (price: number) => plotTop + (1 - (price - yMin) / span) * plotHeight
}
