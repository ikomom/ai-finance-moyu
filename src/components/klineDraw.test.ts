// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { drawKline } from './klineDraw'
import type { KLineBar, PriceLine, Quote } from '../types'

/**
 * Headless smoke test for the K-line painter.
 *
 * The painter was split into `klineDraw` + `paintSubchart` + `paintBarsAndOverlay`;
 * these tests drive it with a recording 2D context so a mis-wired stage (a
 * missing value, a loop that never terminates) fails here instead of hanging the
 * real window.
 */

interface Recorder {
  calls: string[]
  ctx: Record<string, unknown>
}

function recordingCtx(): Recorder {
  const calls: string[] = []
  const target: Record<string, unknown> = {
    canvas: undefined,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  }
  return {
    calls,
    ctx: new Proxy(target, {
      get(obj, prop: string) {
        if (prop in obj) return obj[prop]
        // Any drawing call is a no-op that records its name.
        return (..._args: unknown[]) => {
          calls.push(prop)
          return undefined
        }
      },
      set(obj, prop: string, value) {
        obj[prop] = value
        return true
      },
    }),
  }
}

function fakeCanvas(recorder: Recorder, w = 600, h = 320): HTMLCanvasElement {
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: w,
    clientHeight: h,
    dataset: {} as Record<string, string>,
    getBoundingClientRect: () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h }),
    getContext: () => recorder.ctx,
  }
  return canvas as unknown as HTMLCanvasElement
}

function bars(n: number): KLineBar[] {
  const out: KLineBar[] = []
  let close = 10
  for (let i = 0; i < n; i++) {
    const open = close
    close = open + (i % 2 === 0 ? 0.12 : -0.08)
    out.push({
      date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      open,
      close,
      high: Math.max(open, close) + 0.05,
      low: Math.min(open, close) - 0.05,
      volume: 1000 + i * 10,
      ma5: null,
      ma10: null,
      ma20: null,
      dif: i === 0 ? 0 : 0.01 * i,
      dea: i === 0 ? 0 : 0.008 * i,
      macd: i === 0 ? 0 : 0.004 * i,
    })
  }
  return out
}

const quote: Quote = {
  code: 'sh600000',
  name: '浦发银行',
  price: 11.2,
  preClose: 11,
  open: 11,
  high: 11.3,
  low: 10.9,
  volume: 123456,
  change: 0.2,
  changePct: 1.8,
  date: '20260320',
  time: '10:00:00',
  bids: [],
  asks: [],
}

const priceLines: PriceLine[] = [
  { price: 11.5, label: '压力', direction: 'above' },
  { price: 10.5, label: '支撑', direction: 'below' },
]

describe('drawKline', () => {
  it('paints a volume subchart without throwing', () => {
    const rec = recordingCtx()
    const canvas = fakeCanvas(rec)

    expect(() =>
      drawKline({
        canvas,
        props: { subchartMode: 'vol', costPrice: 10.5, priceLines },
        bars: bars(40),
        quote,
        hoveredIndex: null,
        visibleCount: 30,
        offsetRight: 0,
      })
    ).not.toThrow()

    // Candles are drawn with fillRect; the volume pane too.
    expect(rec.calls.filter((c) => c === 'fillRect').length).toBeGreaterThan(10)
    expect(rec.calls).toContain('stroke')
  })

  it('paints a MACD subchart without throwing', () => {
    const rec = recordingCtx()
    const canvas = fakeCanvas(rec)

    expect(() =>
      drawKline({
        canvas,
        props: { subchartMode: 'macd' },
        bars: bars(60),
        quote,
        hoveredIndex: 20,
        visibleCount: 40,
        offsetRight: 0,
      })
    ).not.toThrow()
    expect(rec.calls.length).toBeGreaterThan(20)
  })

  it('draws the crosshair for a hovered bar', () => {
    const rec = recordingCtx()
    const canvas = fakeCanvas(rec)

    drawKline({
      canvas,
      props: { subchartMode: 'vol' },
      bars: bars(30),
      quote,
      hoveredIndex: 15,
      visibleCount: 30,
      offsetRight: 0,
    })

    expect(rec.calls).toContain('setLineDash')
  })

  it('renders the loading placeholder when there are no bars', () => {
    const rec = recordingCtx()
    const canvas = fakeCanvas(rec)

    drawKline({
      canvas,
      props: {},
      bars: [],
      quote,
      hoveredIndex: null,
      visibleCount: 30,
      offsetRight: 0,
    })

    expect(rec.calls).toContain('fillText')
  })

  it('terminates for a degenerate window (offset past the series)', () => {
    const rec = recordingCtx()
    const canvas = fakeCanvas(rec)

    expect(() =>
      drawKline({
        canvas,
        props: { subchartMode: 'vol' },
        bars: bars(10),
        quote,
        hoveredIndex: null,
        visibleCount: 400,
        offsetRight: 50,
      })
    ).not.toThrow()
  })

  it('accurately resolves bar color for flat limit-down and limit-up bars (A-share rules)', async () => {
    const { isBarUp } = await import('./klinePaintTypes')

    // 1. Normal up and down
    const upBar: KLineBar = { date: '2026-11-17', open: 9.11, close: 9.80, high: 9.80, low: 9.11, volume: 100 }
    expect(isBarUp(upBar)).toBe(true)

    const downBar: KLineBar = { date: '2026-11-17', open: 9.80, close: 9.11, high: 9.80, low: 9.11, volume: 100 }
    expect(isBarUp(downBar)).toBe(false)

    // 2. Limit-down flat bar (like 慈文传媒: open=7.38, close=7.38, yesterday close=8.20)
    const prevBar: KLineBar = { date: '2026-11-18', open: 8.20, close: 8.20, high: 8.66, low: 8.20, volume: 500 }
    const ciwenLimitDown: KLineBar = { date: '2026-11-19', open: 7.38, close: 7.38, high: 7.43, low: 7.38, volume: 100 }
    expect(isBarUp(ciwenLimitDown, prevBar)).toBe(false)

    // 3. Limit-up flat bar (open=11.00, close=11.00, yesterday close=10.00)
    const prevUp: KLineBar = { date: '2026-11-18', open: 9.50, close: 10.00, high: 10.00, low: 9.50, volume: 500 }
    const limitUpBar: KLineBar = { date: '2026-11-19', open: 11.00, close: 11.00, high: 11.00, low: 11.00, volume: 100 }
    expect(isBarUp(limitUpBar, prevUp)).toBe(true)
  })
})
