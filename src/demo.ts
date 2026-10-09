// Sample data for previewing the UI without a Tauri runtime or a live market.
//
// Used when the page is opened in a plain browser (`npm run dev` and visit
// http://localhost:1420), which makes the widget's rendering testable and
// screenshot-able on a weekend, with the market closed, or on a locked desktop.
//
// The series is deliberately shaped to exercise the chart's tricky parts: a full
// 241-point session whose timestamps jump 11:30 -> 13:01, so the lunch break has
// to be collapsed rather than drawn as a gap.

import type { Quote, Snapshot, Trend, TrendPoint, WatchItem } from './types'

/** Deterministic PRNG so every preview render looks identical. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The 241 `HHMM` stamps of a full session, lunch break collapsed. */
function sessionTimes(): number[] {
  const out: number[] = []
  for (let m = 9 * 60 + 30; m <= 11 * 60 + 30; m++) out.push((Math.floor(m / 60) * 100) + (m % 60))
  for (let m = 13 * 60 + 1; m <= 15 * 60; m++) out.push((Math.floor(m / 60) * 100) + (m % 60))
  return out
}

interface Seed {
  code: string
  name: string
  preClose: number
  /** Total drift over the session, as a fraction of preClose. */
  drift: number
  costPrice?: number
  priceLines?: WatchItem['priceLines']
}

const SEEDS: Seed[] = [
  {
    code: 'sh600000',
    name: '浦发银行',
    preClose: 9.48,
    drift: 0.022,
    costPrice: 9.3,
    priceLines: [
      { price: 9.62, direction: 'above', label: '压力' },
      { price: 9.4, direction: 'below', label: '支撑' },
    ],
  },
  { code: 'sz300750', name: '宁德时代', preClose: 291.11, drift: -0.018, costPrice: 305 },
  { code: 'sh000001', name: '上证指数', preClose: 3842.19, drift: 0.006 },
  { code: 'sz399001', name: '深证成指', preClose: 12887.62, drift: -0.009 },
  { code: 'sz399006', name: '创业板指', preClose: 3135.28, drift: -0.021 },
]

function buildTrend(seed: Seed): Trend {
  const rnd = mulberry32(
    seed.code.split('').reduce((acc, c) => acc + c.charCodeAt(0), 7),
  )
  const times = sessionTimes()
  const points: TrendPoint[] = []

  let price = seed.preClose
  let cumVolume = 0
  let cumAmount = 0

  times.forEach((time, i) => {
    const progress = i / (times.length - 1)
    // Smooth drift toward the target, plus bounded noise, plus a mid-morning dip
    // so the curve has some shape worth looking at.
    const target = seed.preClose * (1 + seed.drift * progress)
    const wobble = seed.preClose * 0.0016 * (rnd() - 0.5)
    const dip = i === 40 ? -seed.preClose * 0.004 : 0
    price += (target - price) * 0.06 + wobble + dip

    const barVolume = 400 + rnd() * 2600
    cumVolume += barVolume
    cumAmount += barVolume * 100 * price

    points.push({
      time,
      price: round(price, 3),
      cumVolume: round(cumVolume, 0),
      cumAmount: round(cumAmount, 2),
      // Mirrors the Rust side: derived from cumulative amount over volume.
      avgPrice: round(cumAmount / (cumVolume * 100), 3),
    })
  })

  return { code: seed.code, date: '20261008', preClose: seed.preClose, points }
}

function round(v: number, d: number): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}

export function demoSnapshot(): Snapshot {
  const trends: Record<string, Trend> = {}
  const quotes: Quote[] = []

  for (const seed of SEEDS) {
    const trend = buildTrend(seed)
    trends[seed.code] = trend

    const last = trend.points[trend.points.length - 1]
    quotes.push({
      code: seed.code,
      name: seed.name,
      price: last.price,
      preClose: seed.preClose,
      open: trend.points[0].price,
      high: Math.max(...trend.points.map((p) => p.price)),
      low: Math.min(...trend.points.map((p) => p.price)),
      volume: last.cumVolume,
      change: round(last.price - seed.preClose, 3),
      changePct: round(((last.price - seed.preClose) / seed.preClose) * 100, 2),
      date: '20261008',
      time: '20261008150000',
    })
  }

  const layoutParam = new URLSearchParams(location.search).get('layout')

  return {
    config: {
      watchlist: SEEDS.map((s) => ({
        code: s.code,
        costPrice: s.costPrice ?? null,
        alertPct: null,
        priceLines: s.priceLines ?? [],
      })),
      layout: layoutParam === 'bar' || layoutParam === 'list' ? layoutParam : 'mini',
      opacity: 1,
      dataSource: 'tencent',
      hotkeys: {
        toggle: 'ctrl+alt+h',
        layoutBar: 'ctrl+alt+1',
        layoutMini: 'ctrl+alt+2',
        layoutList: 'ctrl+alt+3',
      },
      alertPct: 3,
      pollQuotesMs: 3000,
      pollTrendMs: 30000,
      notifications: true,
      autostart: false,
      window: { x: 0, y: 0, width: 320, height: 170 },
      visibilityMode: 'always',
      trendEngine: true,
    },
    quotes,
    trends,
    trendSignals: {
      sh600000: {
        state: 'breakoutPullback',
        label: '▲ 突破回踩',
        compactLabel: '回踩',
        score: 75,
        biasPct: 0.35,
        summary: '回踩分时均线企稳不破，抛压衰竭，短线支撑良好',
        updatedAt: Math.floor(Date.now() / 1000),
      },
      sz300750: {
        state: 'vwapResistance',
        label: '▼ 反抽承压',
        compactLabel: '承压',
        score: -55,
        biasPct: -0.42,
        summary: '反抽分时均线受阻遇压，均线压制明显，防守为主',
        updatedAt: Math.floor(Date.now() / 1000),
      },
    },
    status: {
      lastUpdate: '15:00:00',
      error: null,
      feedDate: '20261008',
      tradingToday: true,
      session: 'Afternoon',
    },
    dock: {
      edge: 'none',
      collapsed: false,
    },
  }
}
