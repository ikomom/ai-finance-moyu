// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from 'solid-js/web'
import { DragonTigerBadge } from './DragonTigerBadge'
import { cleanBranchName, shortenLhbReason } from './DragonTigerDrawer'

// Mock fetchStockDragonTiger to avoid IPC calls in tests
vi.mock('../../tauri', () => ({
  fetchStockDragonTiger: vi.fn().mockResolvedValue(null),
}))

describe('cleanBranchName', () => {
  it('cleans up verbose suffixes', () => {
    expect(
      cleanBranchName('中泰证券股份有限公司上海金沙江路证券营业部')
    ).toBe('中泰证券上海金沙江路营业部')
    expect(
      cleanBranchName('东方财富证券股份有限公司拉萨东环路第二证券营业部')
    ).toBe('东方财富证券拉萨东环路第二营业部')
    expect(
      cleanBranchName('国信证券股份有限公司浙江互联网分公司')
    ).toBe('国信证券浙江互联网分公司')
  })
})

describe('shortenLhbReason', () => {
  it('shortens 3-day accumulated deviations', () => {
    expect(
      shortenLhbReason('非S证券连续三个交易日内收盘价格跌幅偏离值累计达到20%的证券')
    ).toBe('3日跌幅偏离达20%')
    expect(
      shortenLhbReason('连续三个交易日内收盘价格涨幅偏离值累计达到20%的证券')
    ).toBe('3日涨幅偏离达20%')
  })

  it('shortens intraday 7% deviations', () => {
    expect(shortenLhbReason('日涨幅偏离值达到7%的前5只证券')).toBe('日涨幅偏离达7%')
    expect(shortenLhbReason('日收盘价涨幅偏离值达到7%的证券')).toBe('日涨幅偏离达7%')
  })

  it('shortens turnover and amplitude deviations', () => {
    expect(shortenLhbReason('日换手率达到20%的前5只证券')).toBe('日换手率达20%')
    expect(shortenLhbReason('日振幅值达到15%的前5只证券')).toBe('日振幅达15%')
  })
})

describe('DragonTigerBadge', () => {
  it('does not render badge when no LHB data', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(() => <DragonTigerBadge code="sh600000" />, container)

    // Wait for effect to settle
    await new Promise((r) => setTimeout(r, 50))

    const btn = container.querySelector('button')
    expect(btn).toBeNull()
  })

  it('triggers onClick callback when clicked', async () => {
    // Import the mock to override for this test
    const { fetchStockDragonTiger } = await import('../../tauri')
    const mockFn = fetchStockDragonTiger as ReturnType<typeof vi.fn>

    // Return LHB data with a recent trade_date
    const today = new Date().toISOString().slice(0, 10)
    mockFn.mockResolvedValueOnce({
      code: 'sz000977',
      dragon_tiger: {
        code: 'sz000977',
        name: '浪潮信息',
        trade_date: today,
        reason: '日涨幅偏离值达7%',
        close_price: 46.80,
        change_pct: 9.98,
        net_total: 248_000_000,
        institution_buy: 195_000_000,
        institution_sell: 0,
        institution_net: 195_000_000,
        top_buyers: [],
        top_sellers: [],
      },
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    const handleClick = vi.fn()
    render(() => <DragonTigerBadge code="sz000977" onClick={handleClick} />, container)

    // Wait for async effect
    await new Promise((r) => setTimeout(r, 100))

    const btn = container.querySelector('button')
    expect(btn).not.toBeNull()
    btn?.click()
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
