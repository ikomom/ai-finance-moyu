import { describe, expect, it } from 'vitest'

import {
  fmtHHMM,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtSigned,
  fmtVol,
  isIndexCode,
  profitAmount,
  profitPct,
  resolveIndicatorParams,
  trendClass,
} from '../types'
import { fmtTime } from '../utils/format'

describe('number formatting', () => {
  it('always signs percentages so up/down is unambiguous', () => {
    expect(fmtPct(1.234)).toBe('+1.23%')
    expect(fmtPct(-0.5)).toBe('-0.50%')
    expect(fmtPct(0)).toBe('+0.00%')
  })

  it('formats prices with a fixed precision', () => {
    expect(fmtPrice(9.5)).toBe('9.50')
    expect(fmtPrice(9.555, 3)).toBe('9.555')
  })

  it('formats signed numbers', () => {
    expect(fmtSigned(12.345)).toBe('+12.35')
    expect(fmtSigned(-12.345)).toBe('-12.35')
  })

  it('scales volume into 万/亿', () => {
    expect(fmtVol(999)).toBe('999')
    expect(fmtVol(12_345)).toBe('1.2万')
    expect(fmtVol(123_456_789)).toBe('1.2亿')
  })

  it('formats money with a currency sign and thousands separators', () => {
    expect(fmtMoney(1234.5)).toBe('+¥1,234.50')
    expect(fmtMoney(-1234.5)).toBe('-¥1,234.50')
    expect(fmtMoney(0)).toBe('¥0.00')
  })

  it('formats HHMM without dropping leading minutes', () => {
    expect(fmtHHMM(930)).toBe('9:30')
    expect(fmtHHMM(1305)).toBe('13:05')
    expect(fmtTime(930)).toBe('09:30')
    expect(fmtTime(5)).toBe('00:05')
  })
})

describe('profit helpers', () => {
  it('returns null when there is no usable cost basis', () => {
    expect(profitPct(10, 0)).toBeNull()
    expect(profitPct(0, 10)).toBeNull()
    expect(profitAmount(10, null, 100)).toBeNull()
    expect(profitAmount(10, 9, 0)).toBeNull()
  })

  it('computes floating profit', () => {
    expect(profitPct(11, 10)).toBeCloseTo(10)
    expect(profitPct(9, 10)).toBeCloseTo(-10)
    expect(profitAmount(11, 10, 1000)).toBe(1000)
  })
})

describe('trend classification', () => {
  it('maps sign to the A-share up/down/flat class', () => {
    expect(trendClass(1)).toBe('up')
    expect(trendClass(-1)).toBe('down')
    expect(trendClass(0)).toBe('flat')
  })
})

describe('index detection', () => {
  it('recognises the three index prefixes', () => {
    expect(isIndexCode('sh000001')).toBe(true)
    expect(isIndexCode('sz399001')).toBe(true)
    expect(isIndexCode('bj899050')).toBe(true)
  })

  it('does not mistake a normal stock for an index', () => {
    expect(isIndexCode('sh600000')).toBe(false)
    expect(isIndexCode('sz000001')).toBe(false)
  })
})

describe('indicator parameter resolution', () => {
  it('falls back to the classic preset', () => {
    expect(resolveIndicatorParams(null, null)).toEqual({
      ma: [5, 10, 20],
      macd: [12, 26, 9],
    })
  })

  it('prefers per-security custom parameters over the global preset', () => {
    const item = {
      code: 'sh600000',
      indicatorMode: 'custom' as const,
      customMa: [3, 7, 21] as [number, number, number],
      customMacd: [6, 13, 5] as [number, number, number],
    }
    const global = {
      preset: 'classic' as const,
      ma: [5, 10, 20] as [number, number, number],
      macd: [12, 26, 9] as [number, number, number],
    }
    expect(resolveIndicatorParams(item, global)).toEqual({
      ma: [3, 7, 21],
      macd: [6, 13, 5],
    })
  })
})
