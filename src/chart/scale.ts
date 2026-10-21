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

// --- Full Unified Trend Scale (09:15 - 15:00) ---
export const FULL_SLOTS = 255 // Total slots: 15 (auction & pretrade) + 120 (morning) + 120 (afternoon)
export const AUCTION_MORNING_SLOT_END = 10 // 0..10 (09:15 - 09:25)
export const PRETRADE_SLOT_END = 15 // 10..15 (09:25 - 09:30)
export const MORNING_SLOT_END = 135 // 15..135 (09:30 - 11:30)
export const AFTERNOON_CONTINUOUS_SLOT_END = 252 // 135..252 (13:00 - 14:57)
export const CLOSING_AUCTION_SLOT_END = 255 // 252..255 (14:57 - 15:00)

/**
 * Maps any time stamp (HHMM or HHMMSS) onto unified full trend slots (0..255).
 * - 09:15..09:25 -> 0..10
 * - 09:25..09:30 -> 10..15
 * - 09:30..11:30 -> 15..135
 * - 13:00..14:57 -> 135..252
 * - 14:57..15:00 -> 252..255
 */
export function slotOfFullTrend(val: number): number {
  let h = 0
  let m = 0
  let s = 0
  if (val >= 10000) {
    h = Math.floor(val / 10000)
    m = Math.floor((val % 10000) / 100)
    s = val % 100
  } else {
    h = Math.floor(val / 100)
    m = val % 100
  }
  const min = h * 60 + m + s / 60

  if (min <= 9 * 60 + 15) return 0
  if (min <= 9 * 60 + 30) {
    // 09:15 to 09:30 maps to slot 0..15
    return Math.min(15, Math.max(0, min - (9 * 60 + 15)))
  }
  if (min <= 11 * 60 + 30) {
    // 09:30 to 11:30 maps to slot 15..135
    return Math.min(135, Math.max(15, 15 + (min - (9 * 60 + 30))))
  }
  if (min < 13 * 60) {
    // 11:30 to 13:00 collapsed lunch break
    return 135
  }
  if (min <= 15 * 60) {
    // 13:00 to 15:00 maps to slot 135..255 (14:57 is 252, 15:00 is 255)
    return Math.min(FULL_SLOTS, Math.max(135, 135 + (min - (13 * 60))))
  }
  return FULL_SLOTS
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
