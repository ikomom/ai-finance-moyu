//! Assemble the demo snapshot from the fixtures.

import type { Quote, Snapshot, Trend } from '../types'
import { SEEDS, buildTrend, round } from './fixtures'

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
        layoutGlobal: 'ctrl+alt+5',
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
