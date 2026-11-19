import { describe, expect, it, vi } from 'vitest'
import { drawMinuteVolumeSubchart, type UnifiedVolumeItem } from './volumeRenderer'

function createMockCtx() {
  const fillRectCalls: Array<{ x: number; y: number; w: number; h: number; fillStyle: string | CanvasGradient | CanvasPattern }> = []
  const fillTextCalls: Array<{ text: string; x: number; y: number; fillStyle: string | CanvasGradient | CanvasPattern }> = []

  let currentFillStyle: string | CanvasGradient | CanvasPattern = '#000000'

  const ctx = {
    get fillStyle() {
      return currentFillStyle
    },
    set fillStyle(val: string | CanvasGradient | CanvasPattern) {
      currentFillStyle = val
    },
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      fillRectCalls.push({ x, y, w, h, fillStyle: currentFillStyle })
    }),
    fillText: vi.fn((text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y, fillStyle: currentFillStyle })
    }),
  } as unknown as CanvasRenderingContext2D

  return { ctx, fillRectCalls, fillTextCalls }
}

describe('volumeRenderer: drawMinuteVolumeSubchart', () => {
  const volT = 100
  const volH = 50
  const subPlotH = 45

  it('renders realistic linear proportions by default (Tonghuashun authentic)', () => {
    const { ctx, fillRectCalls } = createMockCtx()

    const items: UnifiedVolumeItem[] = [
      { x: 10, slot: 1, vol: 38234, isUp: true }, // Peak volume (100% height)
      { x: 20, slot: 2, vol: 19117, isUp: false }, // Exactly 50% height
      { x: 30, slot: 3, vol: 3823, isUp: true }, // Exactly 10% height
    ]

    drawMinuteVolumeSubchart({
      ctx,
      plotL: 0,
      plotW: 100,
      volT,
      volH,
      subPlotH,
      items,
      barWidth: 4,
    })

    expect(fillRectCalls.length).toBe(3)

    // 1. Peak bar at 100%: height should be subPlotH (45)
    const peakBar = fillRectCalls[0]
    expect(peakBar.h).toBe(subPlotH)
    expect(peakBar.y).toBe(volT + volH - subPlotH) // 100 + 50 - 45 = 105

    // 2. 50% bar: height should be 45 * 0.5 = 22.5
    const halfBar = fillRectCalls[1]
    expect(halfBar.h).toBeCloseTo(22.5, 1)
    expect(halfBar.y).toBeCloseTo(volT + volH - 22.5, 1)

    // 3. 10% bar: height should be 45 * 0.1 = 4.5
    const tenthBar = fillRectCalls[2]
    expect(tenthBar.h).toBeCloseTo(4.5, 1)
  })

  it('renders auction sell pressure as inverted ceiling bar hanging from volT', () => {
    const { ctx, fillRectCalls } = createMockCtx()

    const items: UnifiedVolumeItem[] = [
      {
        x: 10,
        slot: 0,
        isAuction: true,
        vol: 15000,
        matchedVol: 5000,
        unmatchedVol: 10000,
        unmatchedSide: 'sell',
      },
      { x: 30, slot: 1, vol: 20000, isUp: true }, // Continuous peak = 20000
    ]

    drawMinuteVolumeSubchart({
      ctx,
      plotL: 0,
      plotW: 100,
      volT,
      volH,
      subPlotH,
      items,
      barWidth: 4,
      scaleMode: 'linear',
    })

    // Item 0 produces 2 bars: matched (from bottom) and unmatched sell (hanging from ceiling)
    // Item 1 produces 1 bar: continuous peak
    expect(fillRectCalls.length).toBe(3)

    // Matched volume: 5000 / 20000 = 25% of 45 = 11.25px from bottom
    const matchedBar = fillRectCalls[0]
    expect(matchedBar.h).toBeCloseTo(11.25, 1)
    expect(matchedBar.y).toBeCloseTo(volT + volH - 11.25, 1)

    // Unmatched sell volume: 10000 / 20000 = 50% of 45 = 22.5px hanging down from volT (100)
    const sellSpike = fillRectCalls[1]
    expect(sellSpike.y).toBe(volT) // Exact ceiling top line
    expect(sellSpike.h).toBeCloseTo(22.5, 1)
  })

  it('renders square-root amplification when scaleMode is sqrt', () => {
    const { ctx, fillRectCalls } = createMockCtx()

    const items: UnifiedVolumeItem[] = [
      { x: 10, slot: 1, vol: 10000, isUp: true }, // Peak = 10000
      { x: 20, slot: 2, vol: 100, isUp: true }, // 1% volume
    ]

    drawMinuteVolumeSubchart({
      ctx,
      plotL: 0,
      plotW: 100,
      volT,
      volH,
      subPlotH,
      items,
      barWidth: 4,
      scaleMode: 'sqrt',
    })

    expect(fillRectCalls.length).toBe(2)

    // In sqrt mode: sqrt(100)/sqrt(10000) = 10/100 = 10% height (amplified from 1% to 10%)
    const smallBar = fillRectCalls[1]
    expect(smallBar.h).toBeCloseTo(subPlotH * 0.1, 1)
  })
})
