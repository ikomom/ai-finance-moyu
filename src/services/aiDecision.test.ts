import { describe, expect, it } from 'vitest'
import {
  decideStockWithAi,
  getAiDecisionConfig,
  getLocalServiceStatus,
  saveAiDecisionConfig,
} from './aiDecision'
import {
  isDecisionCacheValid,
  type DecisionCacheEntry,
  type DecisionCacheCheckContext,
} from './useAiDecision'
import type { StockDecisionPayload, StockDecisionResult } from '../types/aiDecision'

const mockDecisionResult: StockDecisionResult = {
  code: 'sh600519',
  mode: 'online',
  action: 'hold',
  actionLabel: '持股待涨',
  actionConfidence: 0.85,
  isFakePump: 0.1,
  isFakePumpLabel: '10%',
  attribution: 'sector_momentum',
  attributionLabel: '板块动量',
  latencyMs: 120,
  modelName: 'typesafe/jev-1.13',
  rawSummary: '突破',
}

describe('AI Decision Service (Jev / Laya)', () => {
  it('returns default config when running in browser preview mode', async () => {
    const cfg = await getAiDecisionConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.mode).toBe('disabled')
    expect(cfg?.localPort).toBe(9999)
    expect(cfg?.localModelId).toContain('laya-multilingual')
  })

  it('handles save config gracefully in preview mode', async () => {
    const ok = await saveAiDecisionConfig({
      mode: 'local',
      localPort: 8080,
      localModelId: 'convaiinnovations/laya-multilingual',
      onlineModel: 'typesafe/jev-1.13',
      timeoutSecs: 5,
    })
    expect(ok).toBe(true)
  })

  it('reports offline/preview status when checking local service in mock environment', async () => {
    const status = await getLocalServiceStatus(9999)
    expect(status.port).toBe(9999)
    expect(status.message).toContain('预览模式')
  })

  it('returns high confidence mock decision with 3 core answers in preview mode', async () => {
    const payload: StockDecisionPayload = {
      code: 'sh600519',
      name: '贵州茅台',
      price: 1800.0,
      changePct: 2.5,
      vwapBias: 0.8,
      activeBuyRatio: 0.62,
      bidAskImbalance: 0.25,
      spatialDesc: '突破早盘箱体高点',
      sectorDesc: '白酒 (+2.1%) (板块领涨)',
    }

    const res = await decideStockWithAi(payload)
    expect(res.code).toBe('sh600519')
    // 核心问题 1: 操盘动作建议
    expect(res.actionLabel).toBeDefined()
    expect(res.actionConfidence).toBeGreaterThan(0.5)
    // 核心问题 2: 主力假突破概率
    expect(res.isFakePump).toBeGreaterThanOrEqual(0.0)
    expect(res.isFakePump).toBeLessThanOrEqual(1.0)
    expect(res.isFakePumpLabel).toContain('%')
    // 核心问题 3: 走势归因分析
    expect(res.attributionLabel).toBeDefined()
    expect(res.rawSummary).toContain('突破')
  })
})

describe('isDecisionCacheValid - Session Awareness & Closing Freeze', () => {
  const baseEntry: DecisionCacheEntry = {
    result: mockDecisionResult,
    ts: 100_000,
    date: '2026-11-03',
    quoteTime: '15:00:00',
    session: 'Closed',
    isClosing: true,
  }

  it('returns false for undefined cache entry', () => {
    expect(isDecisionCacheValid(undefined, { session: 'Closed' })).toBe(false)
  })

  it('returns false if cached date is different from current quote date', () => {
    const entry: DecisionCacheEntry = { ...baseEntry, date: '2026-11-02' }
    const ctx: DecisionCacheCheckContext = { quoteDate: '2026-11-03', session: 'Closed' }
    expect(isDecisionCacheValid(entry, ctx)).toBe(false)
  })

  it('freezes closing decision during Closed session indefinitely (isClosing = true)', () => {
    const ctx: DecisionCacheCheckContext = {
      now: 100_000 + 3_600_000, // 1 hour later
      session: 'Closed',
      tradingToday: true,
      quoteDate: '2026-11-03',
    }
    // With isClosing = true, cache remains valid indefinitely during Closed
    expect(isDecisionCacheValid(baseEntry, ctx)).toBe(true)
  })

  it('invalidates cache during Closed session if last decision was NOT at close (isClosing = false)', () => {
    // Intraday decision made at 14:30
    const intradayEntry: DecisionCacheEntry = {
      ...baseEntry,
      quoteTime: '14:30:00',
      session: 'Afternoon',
      isClosing: false,
    }
    const ctx: DecisionCacheCheckContext = {
      session: 'Closed',
      tradingToday: true,
      quoteDate: '2026-11-03',
    }
    // "除非最后一次决策不是收盘时候的" -> Needs a fresh closing decision!
    expect(isDecisionCacheValid(intradayEntry, ctx)).toBe(false)
  })

  it('freezes closing decision during non-trading day (weekends/holidays)', () => {
    const ctx: DecisionCacheCheckContext = {
      session: 'Closed',
      tradingToday: false,
      quoteDate: '2026-11-03',
    }
    expect(isDecisionCacheValid(baseEntry, ctx)).toBe(true)
  })

  it('freezes midday decision during LunchBreak when quote is from 11:30', () => {
    const lunchEntry: DecisionCacheEntry = {
      ...baseEntry,
      quoteTime: '11:30:00',
      session: 'LunchBreak',
      isClosing: false,
    }
    const ctx: DecisionCacheCheckContext = {
      now: 100_000 + 1_800_000, // 30 min later
      session: 'LunchBreak',
      tradingToday: true,
      quoteDate: '2026-11-03',
    }
    expect(isDecisionCacheValid(lunchEntry, ctx)).toBe(true)
  })

  it('keeps cached entry during PreOpen session without repeated requests', () => {
    const ctx: DecisionCacheCheckContext = {
      session: 'PreOpen',
      tradingToday: true,
      quoteDate: '2026-11-03',
    }
    expect(isDecisionCacheValid(baseEntry, ctx)).toBe(true)
  })

  it('respects 30s TTL during continuous trading session (Morning / Afternoon)', () => {
    const entry: DecisionCacheEntry = {
      ...baseEntry,
      ts: 1_000_000,
      session: 'Morning',
      isClosing: false,
    }
    const ctxFresh: DecisionCacheCheckContext = {
      now: 1_000_000 + 10_000, // 10s later
      session: 'Morning',
      tradingToday: true,
      quoteDate: '2026-11-03',
    }
    expect(isDecisionCacheValid(entry, ctxFresh, 30_000)).toBe(true)

    const ctxExpired: DecisionCacheCheckContext = {
      now: 1_000_000 + 35_000, // 35s later
      session: 'Morning',
      tradingToday: true,
      quoteDate: '2026-11-03',
    }
    expect(isDecisionCacheValid(entry, ctxExpired, 30_000)).toBe(false)
  })
})
