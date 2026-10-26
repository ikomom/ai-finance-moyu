import { describe, expect, it } from 'vitest'
import { diagnoseStock } from './stockDiagnosis'
import type { Quote, TrendSignal } from '../types'

function mockQuote(
  price: number,
  preClose: number,
  overrides?: Partial<Quote>
): Quote {
  return {
    code: 'sh600519',
    name: '贵州茅台',
    price,
    preClose,
    open: preClose,
    high: Math.max(price, preClose),
    low: Math.min(price, preClose),
    volume: 50000,
    change: price - preClose,
    changePct: ((price - preClose) / preClose) * 100,
    date: '20261023',
    time: '10:30:00',
    ...overrides,
  }
}

function mockSignal(
  state: TrendSignal['state'],
  score: number,
  biasPct: number,
  overrides?: Partial<TrendSignal>
): TrendSignal {
  return {
    state,
    label: 'mock',
    compactLabel: 'mock',
    score,
    biasPct,
    summary: 'Mock summary',
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('StockDiagnosis engine (diagnoseStock)', () => {
  it('diagnoses steadyBull (稳步多头·顺势持股)', () => {
    const q = mockQuote(1800, 1780, { bidAskImbalance: 0.25, activeBuyRatio: 0.62 })
    const sig = mockSignal('steadyBull', 45, 0.8)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('▲ 稳步多头 · 可持股')
    expect(res.compactLabel).toBe('多头(持)')
    expect(res.guidance).toBe('【顺势持股】')
    expect(res.tone).toBe('bull')
    expect(res.vwapStatusText).toContain('站稳均线 (+0.8%)')
    expect(res.imbalanceText).toContain('买盘占优 (+25%)')
    expect(res.activeBuyText).toContain('62% (主动扫单)')
    expect(res.scoreLabel).toBe('多头主导 (+45)')
    expect(res.isPositiveScore).toBe(true)
  })

  it('diagnoses vwapOverbought (冲高乖离·慎盲追高)', () => {
    const q = mockQuote(1850, 1780)
    const sig = mockSignal('vwapOverbought', 15, 2.8)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('⚡ 冲高乖离 · 慎盲追高')
    expect(res.compactLabel).toBe('乖离(慎)')
    expect(res.guidance).toBe('【慎盲追高】')
    expect(res.tone).toBe('warn')
    expect(res.vwapStatusText).toContain('站稳均线 (+2.8%)')
  })

  it('diagnoses breakdown (放量破位·严守止损)', () => {
    const q = mockQuote(1720, 1780, { bidAskImbalance: -0.35, activeBuyRatio: 0.38 })
    const sig = mockSignal('breakdown', -65, -1.8)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('❄️ 放量破位 · 严守止损')
    expect(res.compactLabel).toBe('破位(止)')
    expect(res.guidance).toBe('【防守止损】')
    expect(res.tone).toBe('bear')
    expect(res.vwapStatusText).toContain('均线下破 (-1.8%)')
    expect(res.imbalanceText).toContain('压盘沉重 (-35%)')
    expect(res.activeBuyText).toContain('38% (大单抛盘)')
    expect(res.scoreLabel).toBe('空头压制 (-65)')
    expect(res.isPositiveScore).toBe(false)
  })

  it('diagnoses consolidation (窄幅整理·观望蓄势)', () => {
    const q = mockQuote(1780, 1780, { bidAskImbalance: 0.02, activeBuyRatio: 0.5 })
    const sig = mockSignal('consolidation', 0, 0.0)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('● 窄幅整理 · 观望蓄势')
    expect(res.compactLabel).toBe('整理(看)')
    expect(res.guidance).toBe('【观望蓄势】')
    expect(res.tone).toBe('neutral')
    expect(res.vwapStatusText).toContain('均线平稳 (0.0%)')
    expect(res.imbalanceText).toContain('买卖均衡 (+2%)')
    expect(res.scoreLabel).toBe('多空均衡 (0)')
  })

  it('correctly calculates ORB spatial position and sector linkage', () => {
    const q = mockQuote(185.0, 180.0)
    const sig = mockSignal('orbBreakoutUp', 50, 1.2, {
      orbHigh: 184.0,
      orbLow: 181.0,
      sectorLinkage: {
        sectorCode: 'bk001',
        sectorName: '半导体芯片',
        sectorChangePct: 3.5,
        deltaRSector: 1.5,
        deltaRMarket: 2.0,
        leaderCode: 'sh688981',
        leaderName: '中芯国际',
        leaderChangePct: 5.2,
        role: '领涨核心',
        diagnosis: '板块核心',
      },
    })
    const res = diagnoseStock(q, sig)

    expect(res.spatialText).toBe('突破早盘高点 184.00')
    expect(res.spatialTone).toBe('bull')
    expect(res.sectorText).toContain('半导体芯片 (+3.5%)')
    expect(res.sectorRoleText).toContain('领涨核心 · 超额 +1.5%')
    expect(res.leaderText).toContain('中芯国际 (+5.2%)')
  })

  it('diagnoses sealedLimitDown (封死跌停·观望封单)', () => {
    const q = mockQuote(4.42, 4.91, { bidAskImbalance: -1.0, activeBuyRatio: 0.05 })
    const sig = mockSignal('sealedLimitDown', -100, -9.98, { summary: '' })
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('🔒 封死跌停 · 观望封单')
    expect(res.compactLabel).toBe('跌停(锁)')
    expect(res.tone).toBe('bear')
    expect(res.guidance).toBe('【观望封单】')
    expect(res.actionSummary).toContain('买档真空流动性枯竭')
  })

  it('diagnoses brokenLimitDown (跌停翘板·资金博弈)', () => {
    const q = mockQuote(4.55, 4.91, { bidAskImbalance: 0.15, activeBuyRatio: 0.58 })
    const sig = mockSignal('brokenLimitDown', -35, -7.33)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('⚡ 跌停翘板 · 资金博弈')
    expect(res.compactLabel).toBe('翘板(察)')
    expect(res.tone).toBe('warn')
  })

  it('diagnoses sealedLimitUp (封死涨停·顺势持股)', () => {
    const q = mockQuote(11.0, 10.0, { bidAskImbalance: 1.0, activeBuyRatio: 0.95 })
    const sig = mockSignal('sealedLimitUp', 100, 10.0)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('🔒 封死涨停 · 顺势持股')
    expect(res.compactLabel).toBe('涨停(持)')
    expect(res.tone).toBe('bull')
  })

  it('diagnoses brokenLimitUp (涨停炸板·逢高减仓)', () => {
    const q = mockQuote(10.8, 10.0, { bidAskImbalance: -0.2, activeBuyRatio: 0.42 })
    const sig = mockSignal('brokenLimitUp', 30, 8.0)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('⚡ 涨停炸板 · 逢高减仓')
    expect(res.compactLabel).toBe('炸板(减)')
    expect(res.tone).toBe('warn')
  })
})
