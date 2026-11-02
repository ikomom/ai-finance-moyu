// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from 'solid-js/web'
import { SeatRadarView } from './SeatRadarView'

vi.mock('../../tauri', () => ({
  fetchSeatRadar: vi.fn().mockResolvedValue({
    query_date: '2026-11-02',
    items: [
      {
        code: 'sh603019',
        name: '中科曙光',
        trade_date: '2026-11-02',
        branch_name: '中信建投证券股份有限公司北京东城分公司',
        trader_label: '呼家楼',
        is_buy: true,
        buy_amount: 95000000,
        sell_amount: 0,
        net_amount: 95000000,
        close_price: 78.5,
        change_pct: 10.0,
        reason: '日涨幅偏离达7%',
      },
      {
        code: 'sz002049',
        name: '紫光国微',
        trade_date: '2026-11-02',
        branch_name: '国泰君安证券股份有限公司上海江苏路证券营业部',
        trader_label: '章盟主',
        is_buy: false,
        buy_amount: 5000000,
        sell_amount: 65000000,
        net_amount: -60000000,
        close_price: 72.3,
        change_pct: 5.16,
        reason: '日涨幅偏离达7%',
      },
    ],
  }),
}))

describe('SeatRadarView', () => {
  it('renders seat radar controls and items', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const handleOpenDrawer = vi.fn()
    render(() => <SeatRadarView onOpenDrawer={handleOpenDrawer} />, container)

    // Wait for async fetch to populate items
    await new Promise((r) => setTimeout(r, 100))

    const title = container.querySelector('.seat-radar-title')
    expect(title).not.toBeNull()
    expect(title?.textContent).toContain('关注席位池')

    // Check items rendered
    const cards = container.querySelectorAll('.seat-result-card')
    expect(cards.length).toBe(2)

    // First card should be 中科曙光 with 呼家楼
    expect(cards[0].textContent).toContain('中科曙光')
    expect(cards[0].textContent).toContain('呼家楼')
    expect(cards[0].textContent).toContain('买入')

    // Click the first card
    ;(cards[0] as HTMLElement).click()
    expect(handleOpenDrawer).toHaveBeenCalledWith(
      'sh603019',
      '中科曙光',
      '中信建投证券股份有限公司北京东城分公司'
    )
  })

  it('filters items by direction (buy/sell)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(() => <SeatRadarView />, container)
    await new Promise((r) => setTimeout(r, 100))

    const dirButtons = container.querySelectorAll('.seat-dir-btn')
    expect(dirButtons.length).toBe(3) // 全部, 买入, 卖出

    // Switch to 买入
    const buyBtn = Array.from(dirButtons).find((b) => b.textContent?.includes('买入')) as HTMLButtonElement
    buyBtn?.click()
    await new Promise((r) => setTimeout(r, 50))

    let cards = container.querySelectorAll('.seat-result-card')
    expect(cards.length).toBe(1)
    expect(cards[0].textContent).toContain('中科曙光')

    // Switch to 卖出
    const sellBtn = Array.from(dirButtons).find((b) => b.textContent?.includes('卖出')) as HTMLButtonElement
    sellBtn?.click()
    await new Promise((r) => setTimeout(r, 50))

    cards = container.querySelectorAll('.seat-result-card')
    expect(cards.length).toBe(1)
    expect(cards[0].textContent).toContain('紫光国微')
  })

  it('supports fuzzy search suggestion and adding/removing seats', async () => {
    localStorage.clear()
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(() => <SeatRadarView />, container)
    await new Promise((r) => setTimeout(r, 50))

    // Initial seat capsules count
    const initialCapsules = container.querySelectorAll('.seat-capsule-btn')
    expect(initialCapsules.length).toBe(6)

    // Delete first seat
    const delBtn = initialCapsules[0].querySelector('.seat-capsule-del') as HTMLElement
    delBtn?.click()
    await new Promise((r) => setTimeout(r, 50))

    const afterDelCapsules = container.querySelectorAll('.seat-capsule-btn')
    expect(afterDelCapsules.length).toBe(5)

    // Fuzzy search
    const input = container.querySelector('.seat-custom-input') as HTMLInputElement
    input.value = '拉萨'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))

    const suggestions = container.querySelectorAll('.seat-suggest-item')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0].textContent).toContain('拉萨')

    // Click suggestion item to add
    ;(suggestions[0] as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 50))

    const finalCapsules = container.querySelectorAll('.seat-capsule-btn')
    expect(finalCapsules.length).toBe(6)
  })
})
