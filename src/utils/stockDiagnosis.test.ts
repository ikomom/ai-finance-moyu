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

    expect(res.badgeLabel).toBe('▲ 顺势持股')
    expect(res.compactLabel).toBe('持股')
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

    expect(res.badgeLabel).toBe('⚡ 逢高止盈')
    expect(res.compactLabel).toBe('止盈')
    expect(res.guidance).toBe('【慎盲追高】')
    expect(res.tone).toBe('warn')
    expect(res.vwapStatusText).toContain('站稳均线 (+2.8%)')
  })

  it('falls back to independent stock movement when sector linkage is absent (never mislabels as defense hedge)', () => {
    const q = mockQuote(4.51, 4.38, { code: 'sh600892', name: '大晟文化' })
    const sig = mockSignal('vwapOverbought', 15, 3.5)
    const res = diagnoseStock(q, sig)

    expect(res.sectorText).toBe('个股独立走势')
    expect(res.sectorRoleText).toBe('个股独立博弈')
    expect(res.sectorText).not.toContain('防御避险')
    expect(res.sectorRoleText).not.toContain('大盘权重轮动')
  })

  it('diagnoses breakdown (放量破位·严守止损)', () => {
    const q = mockQuote(1720, 1780, { bidAskImbalance: -0.35, activeBuyRatio: 0.38 })
    const sig = mockSignal('breakdown', -65, -1.8)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('❄️ 严格止损')
    expect(res.compactLabel).toBe('止损')
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

    expect(res.badgeLabel).toBe('● 观望蓄势')
    expect(res.compactLabel).toBe('蓄势')
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

    expect(res.badgeLabel).toBe('🔒 封死跌停')
    expect(res.compactLabel).toBe('跌停')
    expect(res.tone).toBe('bear')
    expect(res.guidance).toBe('【观望封单】')
    expect(res.actionSummary).toContain('买档真空流动性枯竭')
  })

  it('diagnoses brokenLimitDown (跌停翘板·资金博弈)', () => {
    const q = mockQuote(4.55, 4.91, { bidAskImbalance: 0.15, activeBuyRatio: 0.58 })
    const sig = mockSignal('brokenLimitDown', -35, -7.33)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('⚡ 翘板博弈')
    expect(res.compactLabel).toBe('撬板')
    expect(res.tone).toBe('warn')
  })

  it('diagnoses sealedLimitUp (封死涨停·顺势持股)', () => {
    const q = mockQuote(11.0, 10.0, { bidAskImbalance: 1.0, activeBuyRatio: 0.95 })
    const sig = mockSignal('sealedLimitUp', 100, 10.0)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('🚀 封死涨停')
    expect(res.compactLabel).toBe('涨停')
    expect(res.tone).toBe('bull')
  })

  it('diagnoses brokenLimitUp (涨停炸板·逢高减仓)', () => {
    const q = mockQuote(10.8, 10.0, { bidAskImbalance: -0.2, activeBuyRatio: 0.42 })
    const sig = mockSignal('brokenLimitUp', 30, 8.0)
    const res = diagnoseStock(q, sig)

    expect(res.badgeLabel).toBe('⚡ 涨停炸板')
    expect(res.compactLabel).toBe('炸板')
    expect(res.tone).toBe('warn')
  })

  it('correctly maps fallAttribution and multi-concept sectorTags', () => {
    const q = mockQuote(9.5, 10.0, { changePct: -5.0 })
    const sig = mockSignal('panicDumping', -70, -2.5, {
      fallAttribution: {
        code: 'panic_dumping',
        tag: '🚨 主力砸盘',
        reason: '脱离板块独立下杀，内盘卖单持续主动砸盘',
        guidance: '主力资金单边净流出，严禁伸手接飞刀',
        severity: 'danger',
      },
      sectorLinkage: {
        sectorCode: 's1',
        sectorName: '小家电',
        sectorChangePct: 3.5,
        deltaRSector: -8.5,
        deltaRMarket: -4.0,
        leaderCode: 'sz002032',
        leaderName: '苏泊尔',
        leaderChangePct: 5.6,
        role: '脱离板块补跌',
        diagnosis: '大幅落后小家电板块',
        sectors: [
          {
            name: '小家电',
            code: 's1',
            rank: 2,
            changePct: 3.5,
            deltaR: -8.5,
            leaderName: '苏泊尔',
            leaderChangePct: 5.6,
            role: '脱离补跌',
            stage: 'surging',
          },
          {
            name: '智能家居',
            code: 's2',
            rank: 18,
            changePct: 1.2,
            deltaR: -6.2,
            leaderName: '海尔智家',
            leaderChangePct: 2.1,
            role: '跟随整理',
            stage: 'accumulating',
          },
        ],
      },
    })
    const res = diagnoseStock(q, sig)

    expect(res.fallAttribution).toBeDefined()
    expect(res.fallAttribution?.code).toBe('panic_dumping')
    expect(res.fallAttribution?.tag).toBe('🚨 主力砸盘')
    expect(res.fallAttribution?.severity).toBe('danger')

    expect(res.sectorTags).toHaveLength(2)
    expect(res.sectorTags[0].name).toBe('小家电')
    expect(res.sectorTags[0].stage).toBe('surging')
    expect(res.sectorTags[1].name).toBe('智能家居')
    expect(res.sectorTags[1].stage).toBe('accumulating')
  })
})
