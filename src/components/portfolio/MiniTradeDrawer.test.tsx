// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { MiniTradeDrawer } from './MiniTradeDrawer'

vi.mock('../../services/portfolio', () => ({
  getPortfolioSummary: vi.fn(async () => ({
    activeBrokerId: 'b1',
    brokers: [
      {
        id: 'b1',
        name: '模拟账户',
        initialCapital: 100000,
        availableCash: 95000,
        totalEquity: 100000,
        feeConfig: {
          stockRate: 0.0001,
          stockMinFee: 0.5,
          etfRate: 0.00005,
          etfMinFee: 0.25,
          bondRate: 0.00005,
          bondMinFee: 0,
          stampDutyRate: 0.0005,
        },
      },
    ],
    positions: [],
    trades: [],
    totalMarketValue: 5000,
    totalCash: 95000,
    totalEquity: 100000,
    totalPnl: 0,
    totalPnlPct: 0,
    todayPnl: 0,
    positionRatio: 5,
    strictMode: true,
    pendingOrders: [],
  })),
  executeSimulatedTrade: vi.fn(),
  cancelSimulatedOrder: vi.fn(),
  createBrokerAccount: vi.fn(),
}))

describe('MiniTradeDrawer Price Locking', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('initializes price once and locks it against live quote ticks', async () => {
    const [currentPrice, setCurrentPrice] = createSignal(23.27)
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      () => (
        <MiniTradeDrawer
          code="sh600522"
          name="中天科技"
          currentPrice={currentPrice()}
          initialPrice={currentPrice()}
          onClose={() => {}}
        />
      ),
      container
    )

    // Wait for initial render and effect to settle
    await new Promise((r) => setTimeout(r, 20))

    const priceInput = container.querySelector<HTMLInputElement>('input.trade-num-input')
    expect(priceInput).not.toBeNull()
    expect(priceInput!.value).toBe('23.27')

    // Simulate user editing the price to 23.50
    priceInput!.value = '23.50'
    priceInput!.dispatchEvent(new Event('input', { bubbles: true }))
    expect(priceInput!.value).toBe('23.5')

    // Simulate next live quote ticks arriving (e.g. market moved to 24.10)
    setCurrentPrice(24.1)
    await new Promise((r) => setTimeout(r, 20))

    // The user's input price must NOT be overwritten by the live quote tick
    expect(priceInput!.value).toBe('23.5')

    // Another tick arrives (22.80)
    setCurrentPrice(22.8)
    await new Promise((r) => setTimeout(r, 20))
    expect(priceInput!.value).toBe('23.5')

    // Clicking "现价" explicitly updates to the latest live price
    const currentPriceBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === '现价'
    )
    expect(currentPriceBtn).toBeDefined()
    currentPriceBtn!.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(priceInput!.value).toBe('22.8')
  })

  it('preserves user entered price when switching between Buy and Sell tabs', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      () => (
        <MiniTradeDrawer
          code="sh600522"
          name="中天科技"
          currentPrice={23.0}
          initialPrice={23.0}
          onClose={() => {}}
        />
      ),
      container
    )

    await new Promise((r) => setTimeout(r, 20))
    const priceInput = container.querySelector<HTMLInputElement>('input.trade-num-input')!
    priceInput.value = '23.88'
    priceInput.dispatchEvent(new Event('input', { bubbles: true }))

    // Switch to Sell tab
    const sellBtn = container.querySelector<HTMLButtonElement>('button.direction-tab.sell')!
    sellBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    // Price should remain 23.88
    expect(priceInput.value).toBe('23.88')

    // Switch back to Buy tab
    const buyBtn = container.querySelector<HTMLButtonElement>('button.direction-tab.buy')!
    buyBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(priceInput.value).toBe('23.88')
  })
})
