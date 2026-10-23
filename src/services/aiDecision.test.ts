import { describe, expect, it } from 'vitest'
import {
  decideStockWithAi,
  getAiDecisionConfig,
  getLocalServiceStatus,
  saveAiDecisionConfig,
} from './aiDecision'
import type { StockDecisionPayload } from '../types/aiDecision'

describe('AI Decision Service (Jev / Laya)', () => {
  it('returns default config when running in browser preview mode', async () => {
    const cfg = await getAiDecisionConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.mode).toBe('disabled')
    expect(cfg?.localPort).toBe(8000)
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
    const status = await getLocalServiceStatus(8000)
    expect(status.port).toBe(8000)
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
