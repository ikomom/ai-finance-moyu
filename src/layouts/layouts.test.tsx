// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}))
import { render } from 'solid-js/web'

import { Global } from './Global'
import { Mini } from './Mini'
import { setSnapshot } from '../store'
import type { MarketIndex, Snapshot } from '../types'

// jsdom has no ResizeObserver; the chart canvases observe their container.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
}

// Canvas 2D is not implemented by jsdom; the renderers only need a no-op context.
if (!HTMLCanvasElement.prototype.getContext) {
  HTMLCanvasElement.prototype.getContext = (() => null) as never
}


/**
 * Mount-level regression tests for the two chart layouts.
 *
 * They exist because Mini/Global were split into `<MiniBody>` / `<GlobalDetail>`
 * (AGENTS.md §11); a mis-wired prop surfaces here as missing text or a crash
 * instead of in a manual smoke test.
 */

function index(code: string, name: string, price: number, changePct: number): MarketIndex {
  return {
    code,
    name,
    price,
    change: price * (changePct / 100),
    changePct,
    turnover: 1_000_000,
    upCount: 0,
    downCount: 0,
    flatCount: 0,
  }
}

function snapshotWith(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    config: {
      watchlist: [{ code: 'sh600000', name: '浦发银行', costPrice: 9.5, shares: 1000, priceLines: [] }],
      layout: 'mini',
      opacity: 0.92,
      theme: 'dark',
      alertPct: 3,
      pollQuotesMs: 3000,
      pollTrendMs: 30000,
      notifications: true,
      autostart: false,
      trendEngine: true,
      dataSource: 'tencent',
      visibilityMode: 'always',
      hotkeys: {
        toggle: 'ctrl+alt+h',
        layoutBar: 'ctrl+alt+1',
        layoutMini: 'ctrl+alt+2',
        layoutList: 'ctrl+alt+3',
        layoutMarket: 'ctrl+alt+4',
        layoutGlobal: 'ctrl+alt+5',
      },
      anomalyAlerts: {
        rapidChange: true,
        intradayExtremes: true,
        volumeBurst: true,
        limitBoard: true,
      },
      indicatorConfig: { preset: 'classic', ma: [5, 10, 20], macd: [12, 26, 9] },
      window: { x: 0, y: 0, width: 320, height: 170 },
    },
    quotes: [
      {
        code: 'sh600000',
        name: '浦发银行',
        price: 10.2,
        preClose: 10,
        open: 10,
        high: 10.3,
        low: 9.9,
        volume: 12345,
        change: 0.2,
        changePct: 2,
        date: '20261019',
        time: '10:00:00',
        bids: [],
        asks: [],
      },
    ],
    trends: {},
    trendSignals: {},
    auctions: {},
    status: { lastUpdate: '10:00:00', error: null, feedDate: '20261019', tradingToday: true, session: 'Morning' },
    dock: { edge: 'none', collapsed: false },
    marketOverview: {
      indices: [index('000001', '上证指数', 3300, 0.5)],
      upCount: 3000,
      downCount: 1800,
      flatCount: 120,
      totalTurnover: 8.8e11,
      turnoverChangePct: 5,
      turnoverChangeAmount: 4.2e10,
      topSectors: [],
      updatedAt: '10:00:00',
      globalIndices: [
        index('usIXIC', '纳斯达克', 18000, 1.2),
        index('hkHSI', '恒生指数', 20000, -0.4),
      ],
    },
    ...overrides,
  }
}

function mount(component: () => unknown): HTMLDivElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  render(component as never, host)
  return host
}

describe('Mini layout', () => {
  it('renders the selected security with price and cost-basis badge', () => {
    setSnapshot(snapshotWith())
    const host = mount(() => Mini({ flash: false }))

    expect(host.querySelector('.widget, .card')).toBeTruthy()
    expect(host.textContent).toContain('浦发银行')
    // costPrice 9.5 vs price 10.2 -> profit badge
    expect(host.textContent).toContain('浮盈')
    expect(host.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(1)
    host.remove()
  })

  it('renders the empty-state when no quote has arrived', () => {
    setSnapshot(snapshotWith({ quotes: [] }))
    const host = mount(() => Mini({ flash: false }))

    expect(host.textContent).toContain('等待行情')
    host.remove()
  })
})

describe('Global layout', () => {
  it('renders the first global index and its pill tabs', () => {
    setSnapshot(snapshotWith())
    const host = mount(() => Global({ flash: false }))

    expect(host.textContent).toContain('纳斯达克')
    // Two indices -> PillTabs should be present
    expect(host.querySelectorAll('.pill, .pill-tab, button').length).toBeGreaterThan(0)
    host.remove()
  })

  it('falls back to a loading box without overview data', () => {
    setSnapshot(snapshotWith({ marketOverview: null }))
    const host = mount(() => Global({ flash: false }))

    expect(host.textContent).toContain('正在拉取全球股指数据')
    host.remove()
  })
})
