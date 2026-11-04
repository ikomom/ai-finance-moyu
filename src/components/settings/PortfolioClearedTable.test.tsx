// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from 'solid-js/web'
import { PortfolioClearedTable } from './PortfolioClearedTable'
import type { ClearedPositionView } from './portfolioClearedHelpers'

describe('PortfolioClearedTable', () => {
  const sampleCleared: ClearedPositionView[] = [
    {
      brokerId: 'b1',
      code: 'sh600000',
      name: '浦发银行',
      totalBuyAmount: 10005,
      totalSellProceeds: 11991,
      realizedPnl: 1986,
      realizedPct: 19.85,
      buyTradesCount: 1,
      sellTradesCount: 1,
      totalTradesCount: 2,
      totalFee: 14,
      clearedAt: '2026-11-02 14:00:00',
    },
    {
      brokerId: 'b1',
      code: 'sz000001',
      name: '平安银行',
      totalBuyAmount: 7503,
      totalSellProceeds: 6993.5,
      realizedPnl: -509.5,
      realizedPct: -6.79,
      buyTradesCount: 1,
      sellTradesCount: 1,
      totalTradesCount: 2,
      totalFee: 9.5,
      clearedAt: '2026-11-04 11:00:00',
    },
  ]

  it('renders the top stats summary bar and the cleared positions rows', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(() => <PortfolioClearedTable clearedPositions={sampleCleared} />, container)

    expect(container.textContent).toContain('清仓标的:')
    expect(container.textContent).toContain('2 只')
    expect(container.textContent).toContain('胜率:')
    expect(container.textContent).toContain('50%')
    expect(container.textContent).toContain('1赢 1输')
    expect(container.textContent).toContain('+¥1,476.50')

    // Table rows
    expect(container.textContent).toContain('浦发银行')
    expect(container.textContent).toContain('+¥1,986.00')
    expect(container.textContent).toContain('+19.85%')

    expect(container.textContent).toContain('平安银行')
    expect(container.textContent).toContain('-¥509.50')
    expect(container.textContent).toContain('-6.79%')

    container.remove()
  })

  it('renders empty state when there are no cleared positions', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(() => <PortfolioClearedTable clearedPositions={[]} />, container)

    expect(container.textContent).toContain('当前账户暂无清仓标的历史记录')
    expect(container.textContent).toContain('0 只')

    container.remove()
  })

  it('toggles column sorting when clicking sortable table headers', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(() => <PortfolioClearedTable clearedPositions={sampleCleared} />, container)

    const headers = Array.from(container.querySelectorAll<HTMLTableCellElement>('.cleared-sort-th'))
    const pnlHeader = headers.find((h) => h.textContent?.includes('已结盈亏'))
    expect(pnlHeader).toBeDefined()

    // Default was time desc (sz000001 cleared on 11-04 is first)
    const rowsBefore = Array.from(container.querySelectorAll('tbody tr'))
    expect(rowsBefore[0].textContent).toContain('平安银行')

    // Click PnL header -> sort by pnl desc (sh600000 +1986 is first)
    pnlHeader!.click()
    const rowsAfter = Array.from(container.querySelectorAll('tbody tr'))
    expect(rowsAfter[0].textContent).toContain('浦发银行')

    // Click PnL header again -> sort by pnl asc (sz000001 -509.5 is first)
    pnlHeader!.click()
    const rowsAsc = Array.from(container.querySelectorAll('tbody tr'))
    expect(rowsAsc[0].textContent).toContain('平安银行')

    container.remove()
  })
})
