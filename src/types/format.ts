//! Display formatting and small derived-value helpers.
//!
//! Split from `types.ts` (now `types/index.ts`) so the schema and the
//! presentation helpers each stay inside the 300-line budget (AGENTS.md §11).

/** A股 convention: red is up, green is down — inverted from Western markets. */
export const UP = '#e64545'
export const DOWN = '#2fae66'
export const AVG = '#e8b339'

export function trendColor(changePct: number): string {
  if (changePct > 0) return UP
  if (changePct < 0) return DOWN
  return '#9ca3af'
}

export function fmtPrice(v: number, digits = 2): string {
  return v.toFixed(digits)
}

export function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

export function fmtSigned(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`
}

export function fmtVol(v: number): string {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}亿`
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`
  return `${Math.round(v)}`
}

/** 浮盈 relative to an entry price. */
export function profitPct(price: number, costPrice: number): number | null {
  if (costPrice <= 0 || price <= 0) return null
  return ((price - costPrice) / costPrice) * 100
}

/** 浮动盈亏金额 (元). */
export function profitAmount(price: number, costPrice?: number | null, shares?: number | null): number | null {
  if (costPrice == null || shares == null || shares <= 0 || price <= 0) return null
  return (price - costPrice) * shares
}

/** 今日盈亏金额 (元). */
export function todayProfitAmount(price: number, preClose: number, shares?: number | null): number | null {
  if (shares == null || shares <= 0 || !preClose || price <= 0) return null
  return (price - preClose) * shares
}

export function fmtMoney(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : ''
  const abs = Math.abs(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}¥${abs}`
}

/** Formats currency amount without positive sign: `¥1,000.00` or `-¥1,000.00`. */
export function fmtCurrency(v: number): string {
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}¥${abs}`
}

/** `0930` -> `9:30`. */
export function fmtHHMM(t: number): string {
  const h = Math.floor(t / 100)
  const m = t % 100
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * Security names arrive from the quote feed, so they're escaped before being
 * interpolated into markup.
 */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** CSS class for a change value, following the 红涨绿跌 convention. */
export function trendClass(changePct: number): string {
  if (changePct > 0) return 'up'
  if (changePct < 0) return 'down'
  return 'flat'
}

/** Format total turnover into human-readable Chinese units (万亿 / 亿 / 万). */
export function fmtTurnover(turnover?: number | null): string {
  if (!turnover || turnover <= 0) return '--'
  if (turnover >= 1e12) {
    return `${(turnover / 1e12).toFixed(2)}万亿`
  }
  if (turnover >= 1e8) {
    return `${(turnover / 1e8).toFixed(0)}亿`
  }
  return `${(turnover / 1e4).toFixed(0)}万`
}

/** Check if symbol represents an index (no individual call auction or VWAP) */
export function isIndexCode(code: string): boolean {
  return code.startsWith('sh000') || code.startsWith('sz399') || code.startsWith('bj899')
}
