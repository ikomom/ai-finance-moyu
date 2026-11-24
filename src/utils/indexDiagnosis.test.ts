import { describe, expect, it } from 'vitest'
import { diagnoseIndex } from './indexDiagnosis'
import type { MarketIndex, MarketOverview, Quote } from '../types'

function mockQuote(code: string, changePct: number): Quote {
  return {
    code,
    name: '上证指数',
    price: 3300,
    change: 15,
    changePct,
    preClose: 3285,
    open: 3290,
    high: 3310,
    low: 3280,
    volume: 1000000,
    date: '20261023',
    time: '10:00:00',
  }
}

function mockOverview(
  up: number,
  down: number,
  flat: number,
  turnoverChangePct: number = 0,
  turnoverChangeAmount: number = 0,
  sectors: any[] = []
): MarketOverview {
  return {
    indices: [],
    upCount: up,
    downCount: down,
    flatCount: flat,
    totalTurnover: 1800000000000,
    turnoverChangePct,
    turnoverChangeAmount,
    topSectors: sectors,
    updatedAt: '10:00:00',
  }
}

describe('IndexDiagnosis engine (diagnoseIndex)', () => {
  it('detects DIVERGE_INDEX_PUMP (拉权护盘题材失血)', () => {
    const q = mockQuote('sh000001', 0.65)
    const ov = mockOverview(1200, 3800, 100, 2.0, 30000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('DIVERGE_INDEX_PUMP')
    expect(res.badgeLabel).toBe('🚨 权重护盘')
    expect(res.compactLabel).toBe('护盘')
    expect(res.tone).toBe('warn')
    expect(res.guidance).toBe('【谨防诱多】')
    expect(res.summary).toContain('二八失血严重')
  })

  it('detects DIVERGE_BREADTH_PUMP (八二题材火爆轻指数重个股)', () => {
    const q = mockQuote('sh000001', -0.15)
    const ov = mockOverview(3700, 1200, 100, 3.0, 50000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('DIVERGE_BREADTH_PUMP')
    expect(res.badgeLabel).toBe('💎 题材活跃')
    expect(res.compactLabel).toBe('活跃')
    expect(res.tone).toBe('bull')
    expect(res.guidance).toBe('【轻指数重个股】')
  })

  it('detects VOLUME_SHORT_PUMP (缩量冲高诱多风险)', () => {
    const q = mockQuote('sh000001', 0.75)
    const ov = mockOverview(2600, 2300, 100, -8.5, -120000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('VOLUME_SHORT_PUMP')
    expect(res.badgeLabel).toBe('⚠️ 缩量冲高')
    expect(res.compactLabel).toBe('冲高')
    expect(res.tone).toBe('warn')
    expect(res.guidance).toBe('【切忌追高】')
  })

  it('detects BULL_SURGE (放量共振普涨爆发)', () => {
    const q = mockQuote('sh000001', 1.35)
    const ov = mockOverview(4300, 700, 100, 14.5, 220000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('BULL_SURGE')
    expect(res.badgeLabel).toBe('🔥 放量共振')
    expect(res.compactLabel).toBe('共振')
    expect(res.tone).toBe('bull')
    expect(res.guidance).toBe('【顺势看多】')
  })

  it('detects PANIC_DUMP (放量恐慌大跌)', () => {
    const q = mockQuote('sh000001', -1.65)
    const ov = mockOverview(500, 4400, 100, 11.0, 180000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('PANIC_DUMP')
    expect(res.badgeLabel).toBe('❄️ 恐慌杀跌')
    expect(res.compactLabel).toBe('恐慌')
    expect(res.tone).toBe('bear')
    expect(res.guidance).toBe('【多看少动】')
  })

  it('detects DIVERGE_INDEX_PUMP with slight green index (e.g. +0.19% while 78% stocks down)', () => {
    const q = mockQuote('sh000001', 0.19)
    const ov = mockOverview(1100, 3900, 50, -1.0, -10000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('DIVERGE_INDEX_PUMP')
    expect(res.badgeLabel).toBe('🚨 权重护盘')
    expect(res.compactLabel).toBe('护盘')
    expect(res.tone).toBe('warn')
  })

  it('rejects DIVERGE_INDEX_PUMP when ChiNext/Shenzhen or top sectors are surging (e.g. 4000+ up)', () => {
    const q = mockQuote('sh000001', 0.15)
    const ov = mockOverview(4200, 900, 200, -1.0, -10000000000, [
      { name: '数字媒体', changePct: 9.2 },
      { name: '影视院线', changePct: 6.9 },
    ])
    ov.indices = [
      { code: '000001', name: '上证指数', price: 3538, change: 5, changePct: 0.15, turnover: 7000, upCount: 4200, downCount: 900, flatCount: 200 },
      { code: '399001', name: '深证成指', price: 11000, change: 200, changePct: 1.93, turnover: 8000, upCount: 0, downCount: 0, flatCount: 0 },
      { code: '399006', name: '创业板指', price: 2300, change: 70, changePct: 3.08, turnover: 3000, upCount: 0, downCount: 0, flatCount: 0 },
    ]
    const res = diagnoseIndex(q, ov)
    expect(res.code).not.toBe('DIVERGE_INDEX_PUMP')
    expect(res.code).toBe('DIVERGE_BREADTH_PUMP')
    expect(res.badgeLabel).toBe('💎 题材活跃')
    expect(res.compactLabel).toBe('活跃')
    expect(res.tone).toBe('bull')
  })

  it('detects HEAVY_DROP when index drops significantly without surge (e.g. -1.71%)', () => {
    const q = mockQuote('sz399006', -1.71)
    const ov = mockOverview(1100, 3900, 50, -2.0, -20000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('HEAVY_DROP')
    expect(res.badgeLabel).toBe('⚡ 破位重挫')
    expect(res.compactLabel).toBe('破位')
    expect(res.tone).toBe('bear')
  })

  it('detects BLEEDING_DRIFT (弱势阴跌无承接)', () => {
    const q = mockQuote('sh000001', -0.45)
    const ov = mockOverview(1400, 3500, 100, -6.0, -90000000000)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('BLEEDING_DRIFT')
    expect(res.badgeLabel).toBe('📉 弱势阴跌')
    expect(res.compactLabel).toBe('阴跌')
    expect(res.tone).toBe('bear')
    expect(res.guidance).toBe('【防守控仓】')
  })

  it('detects CONSOLIDATION (多空对峙窄幅蓄势)', () => {
    const q = mockQuote('sh000001', 0.05)
    const ov = mockOverview(2500, 2400, 100, 0.0, 0)
    const res = diagnoseIndex(q, ov)

    expect(res.code).toBe('CONSOLIDATION')
    expect(res.badgeLabel).toBe('⚖️ 多空对峙')
    expect(res.compactLabel).toBe('对峙')
    expect(res.tone).toBe('neutral')
    expect(res.guidance).toBe('【观望蓄势】')
  })

  it('correctly categorizes offensive vs defensive vs weight style', () => {
    const q = mockQuote('sh000001', 0.8)
    const techOv = mockOverview(3000, 1800, 200, 2.0, 1000, [
      { name: '半导体芯片', changePct: 4.2 },
      { name: '人工智能AI', changePct: 3.5 },
    ])
    expect(diagnoseIndex(q, techOv).styleInfo.type).toBe('offensive')
    expect(diagnoseIndex(q, techOv).styleInfo.badge).toContain('科技进攻')

    const weightOv = mockOverview(3000, 1800, 200, 2.0, 1000, [
      { name: '国有大行银行', changePct: 2.1 },
      { name: '保险证券', changePct: 1.8 },
    ])
    expect(diagnoseIndex(q, weightOv).styleInfo.type).toBe('weight')
    expect(diagnoseIndex(q, weightOv).styleInfo.badge).toContain('权重维稳')

    const defenseOv = mockOverview(1800, 3000, 200, 2.0, 1000, [
      { name: '黄金贵金属', changePct: 2.8 },
      { name: '煤炭石油', changePct: 1.5 },
    ])
    expect(diagnoseIndex(q, defenseOv).styleInfo.type).toBe('defensive')
    expect(diagnoseIndex(q, defenseOv).styleInfo.badge).toContain('防御避险')
  })

  it('falls back to PENDING for non-index quotes or missing overview', () => {
    const stock = mockQuote('sh600000', 1.0)
    const ov = mockOverview(3000, 2000, 100)
    expect(diagnoseIndex(stock, ov).code).toBe('PENDING')
    expect(diagnoseIndex(mockQuote('sh000001', 1.0), null).code).toBe('PENDING')
  })

  it('formats trendLabel, trendSummary and turnoverDelta concisely without truncation', () => {
    const q = mockQuote('sh000001', 0.2)
    const ov = mockOverview(2600, 2400, 100, -81.9, -1260000000000)
    const sig = {
      state: 'consolidation' as const,
      label: '● 窄幅整理',
      compactLabel: '整理',
      score: 0,
      biasPct: 0.0,
      summary: '价格贴合均价线窄幅纠缠，量能平稳，处于蓄势整理阶段',
      updatedAt: Date.now(),
    }
    const res = diagnoseIndex(q, ov, sig)

    // 精炼微型分时形态标签，杜绝超长句子截断
    expect(res.trendLabel).toBe('窄幅整理 (0.0%)')
    expect(res.trendSummary).toContain('处于蓄势整理阶段')
    expect(res.trendBiasText).toBe(res.trendSummary)

    // 精炼量能标签，提供详细 hover 浮窗数据
    expect(res.turnoverDeltaText).toBe('缩量 1.26万亿')
    expect(res.turnoverDeltaDetail).toBe('较昨日缩量 1.26万亿 (-81.9%)')
  })

  it('correctly calculates yellow-white line spread and classifies scissor divergence states', () => {
    const makeIdx = (code: string, changePct: number, unweightedChangePct?: number, yellowLineSpread?: number): MarketIndex => ({
      code,
      name: '上证指数',
      price: 3500,
      change: 10,
      changePct,
      turnover: 100000000000,
      upCount: 1000,
      downCount: 500,
      flatCount: 100,
      unweightedChangePct,
      yellowLineSpread,
    })

    // 1. 黄上白下 (中小盘领涨，差值 > 0.3%)
    const q1 = mockQuote('sh000001', 0.2)
    const ov1 = mockOverview(3200, 1500, 200)
    ov1.indices = [makeIdx('000001', 0.2, 1.8, 1.6)]
    const res1 = diagnoseIndex(q1, ov1)
    expect(res1.yellowWhiteState).toBe('yellow_lead')
    expect(res1.yellowWhiteLabel).toBe('黄上白下 (+1.6%)')
    expect(res1.yellowWhiteSpread).toBe(1.6)
    expect(res1.yellowWhiteDetail).toContain('中小盘题材走势强于大盘蓝筹')

    // 2. 白上黄下 (权重拉抬失血，差值 < -0.3%)
    const q2 = mockQuote('sh000001', 1.5)
    const ov2 = mockOverview(1200, 3600, 200)
    ov2.indices = [makeIdx('000001', 1.5, -0.5, -2.0)]
    const res2 = diagnoseIndex(q2, ov2)
    expect(res2.yellowWhiteState).toBe('white_lead')
    expect(res2.yellowWhiteLabel).toBe('白上黄下 (-2.0%)')
    expect(res2.yellowWhiteSpread).toBe(-2.0)
    expect(res2.yellowWhiteDetail).toContain('权重蓝筹护盘拉抬')

    // 3. 双线共振 (|差值| <= 0.3%)
    const q3 = mockQuote('sh000001', 1.0)
    const ov3 = mockOverview(2800, 1800, 200)
    ov3.indices = [makeIdx('000001', 1.0, 1.1, 0.1)]
    const res3 = diagnoseIndex(q3, ov3)
    expect(res3.yellowWhiteState).toBe('resonance')
    expect(res3.yellowWhiteLabel).toBe('双线共振 (+0.1%)')
    expect(res3.yellowWhiteSpread).toBe(0.1)

    // 4. 创业板指独立等权与成交额 (399006 杜绝与白线重合)
    const q4 = mockQuote('sz399006', 3.08)
    const ov4 = mockOverview(4860, 310, 180)
    ov4.indices = [
      makeIdx('000001', 0.15, 2.45, 2.30),
      makeIdx('399006', 3.08, 4.23, 1.15),
    ]
    const res4 = diagnoseIndex(q4, ov4)
    expect(res4.yellowWhiteState).toBe('yellow_lead')
    expect(res4.yellowWhiteLabel).toBe('黄上白下 (+1.1%)')
    expect(res4.yellowWhiteSpread).toBe(1.15)
    expect(res4.currentIndexTurnoverText).toBe('1000亿')
  })
})
