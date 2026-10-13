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
      bids: [[last.price - 0.01, 1200], [last.price - 0.02, 2400], [last.price - 0.03, 1800]],
      asks: [[last.price + 0.01, 800], [last.price + 0.02, 1500], [last.price + 0.03, 1100]],
      outerVol: Math.round(last.cumVolume * 0.54),
      innerVol: Math.round(last.cumVolume * 0.46),
      bidAskImbalance: 0.32,
      activeBuyRatio: 0.54,
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
      layout: layoutParam === 'bar' || layoutParam === 'list' || layoutParam === 'market' ? layoutParam : 'mini',
      opacity: 1,
      dataSource: 'tencent',
      hotkeys: {
        toggle: 'ctrl+alt+h',
        layoutBar: 'ctrl+alt+1',
        layoutMini: 'ctrl+alt+2',
        layoutList: 'ctrl+alt+3',
        layoutMarket: 'ctrl+alt+4',
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
        orbHigh: 9.65,
        orbLow: 9.42,
        sectorLinkage: {
          sectorCode: 'pt01801192',
          sectorName: '银行',
          sectorChangePct: 1.15,
          deltaRSector: 1.07,
          deltaRMarket: 1.62,
          leaderCode: 'sh601166',
          leaderName: '兴业银行',
          leaderChangePct: 2.85,
          role: '梯队协同助攻',
          diagnosis: '跟随银行板块主力节奏上行，与龙头兴业银行形成共振',
        },
      },
      sz300750: {
        state: 'vwapResistance',
        label: '▼ 反抽承压',
        compactLabel: '承压',
        score: -55,
        biasPct: -0.42,
        summary: '反抽分时均线受阻遇压，均线压制明显，防守为主',
        updatedAt: Math.floor(Date.now() / 1000),
        orbHigh: 295.0,
        orbLow: 288.5,
        sectorLinkage: {
          sectorCode: 'pt01801083',
          sectorName: '电池',
          sectorChangePct: -0.85,
          deltaRSector: -0.95,
          deltaRMarket: -2.4,
          leaderCode: 'sz300750',
          leaderName: '宁德时代',
          leaderChangePct: -1.8,
          role: '板块领涨核心',
          diagnosis: '为电池板块权重核心，受板块系统性调整拖累反抽承压',
        },
      },
    },
    auctions: {
      sh600000: {
        code: 'sh600000',
        date: '20261008',
        points: [
          { time: 915, price: 11.55, volume: 1200 },
          { time: 917, price: 11.85, volume: 8200 },
          { time: 919, price: 11.92, volume: 9600 },
          { time: 920, price: 11.45, volume: 1800 },
          { time: 922, price: 11.43, volume: 1950 },
          { time: 924, price: 11.41, volume: 2100 },
        ],
        diagnosis: {
          tag: 'bull_trap',
          label: '⚠️ 疑似诱多',
          detail: '早盘虚拉冲高至 +4.8%，09:20锁定后撤单跳水至 +0.3%（量能缩减 78%），警惕开盘接盘风险',
          earlyPeakPct: 4.8,
          lockedPct: 0.3,
          volumeDropPct: 78.1,
        },
      },
      sz300750: {
        code: 'sz300750',
        date: '20261008',
        points: [
          { time: 916, price: 220.0, volume: 600 },
          { time: 918, price: 224.5, volume: 1800 },
          { time: 920, price: 226.0, volume: 2600 },
          { time: 922, price: 227.5, volume: 3200 },
          { time: 924, price: 228.0, volume: 3800 },
        ],
        diagnosis: {
          tag: 'snatching',
          label: '🔥 真实抢筹',
          detail: '09:20锁定后强势维持在 +4.9%，买盘挂单扎实，成交意愿坚决',
          earlyPeakPct: 4.9,
          lockedPct: 4.9,
          volumeDropPct: null,
        },
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
    marketOverview: {
      indices: [
        {
          code: '000001',
          name: '上证指数',
          price: 3386.99,
          change: 18.25,
          changePct: 0.54,
          turnover: 720000000000,
          upCount: 1450,
          downCount: 780,
          flatCount: 110,
        },
        {
          code: '399001',
          name: '深证成指',
          price: 10850.32,
          change: 95.12,
          changePct: 0.88,
          turnover: 1080000000000,
          upCount: 1890,
          downCount: 890,
          flatCount: 120,
        },
        {
          code: '399006',
          name: '创业板指',
          price: 2268.45,
          change: 32.18,
          changePct: 1.44,
          turnover: 480000000000,
          upCount: 920,
          downCount: 380,
          flatCount: 50,
        },
      ],
      upCount: 3340,
      downCount: 1670,
      flatCount: 230,
      totalTurnover: 1800000000000,
      northNetFlow: 4520000000,
      topSectors: [
        {
          code: 'BK0478',
          name: '半导体',
          changePct: 3.82,
          upCount: 120,
          downCount: 15,
          leadStockName: '中芯国际',
        },
        {
          code: 'BK0737',
          name: '电池',
          changePct: 2.76,
          upCount: 88,
          downCount: 18,
          leadStockName: '宁德时代',
        },
        {
          code: 'BK0980',
          name: '人工智能',
          changePct: 2.45,
          upCount: 210,
          downCount: 42,
          leadStockName: '科大讯飞',
        },
        {
          code: 'BK0420',
          name: '汽车整车',
          changePct: 2.15,
          upCount: 22,
          downCount: 8,
          leadStockName: '比亚迪',
        },
      ],
      updatedAt: '15:00:00',
    },
  }
}
