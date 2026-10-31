// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'solid-js/web'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  toast: vi.fn(),
  watchlist: [] as Array<{ code: string; name?: string; group?: string | null }>,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}))

vi.mock('../../store', () => ({
  snapshot: () => ({
    config: {
      watchlist: mocks.watchlist,
      groups: [{ id: 'default', name: '默认自选' }],
      activeGroupId: null,
    },
  }),
  showToast: (...args: unknown[]) => mocks.toast(...args),
}))

// 画布在 jsdom 里没有渲染上下文，且本用例只关心交互链路。
vi.mock('../Chart', () => ({ Chart: () => null }))

// vi.mock 的工厂会被提升到文件顶部，数据只能直接内联在工厂里。
vi.mock('../../tauri', () => ({
  fetchSeatDragonTiger: vi.fn().mockResolvedValue({
    branch_name: '机构专用',
    trader_label: '机构专用',
    same_day_operations: [
      {
        code: 'sz301520',
        name: '万邦医药',
        trade_date: '2026-10-30',
        buy_amount: 10_420_000,
        sell_amount: 0,
        net_amount: 10_420_000,
        close_price: 60.06,
        change_pct: 7.2,
        reason: '日涨幅偏离值达到15%',
      },
      {
        code: 'sz301718',
        name: '通则康威',
        trade_date: '2026-10-30',
        buy_amount: 0,
        sell_amount: 13_770_000,
        net_amount: -13_770_000,
        close_price: 45.0,
        change_pct: -3.1,
        reason: '日换手率达到30%',
      },
    ],
    historical_operations: [],
  }),
  fetchStockTrend: vi.fn().mockResolvedValue({
    code: 'sz301520',
    date: '20261030',
    preClose: 56.0,
    points: [{ time: 930, price: 57.5, cumVolume: 100, cumAmount: 575_000, avgPrice: 57.5 }],
  }),
}))

import { SeatDetailView } from './SeatDetailView'

const flush = () => new Promise((r) => setTimeout(r, 60))

function mount(onOpenInWidget = vi.fn()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  render(
    () => (
      <SeatDetailView
        branchName="机构专用"
        tradeDate="2026-10-30"
        onBack={() => {}}
        onSelectStock={() => {}}
        onOpenInWidget={onOpenInWidget}
      />
    ),
    container
  )
  return container
}

describe('SeatDetailView 分时下钻', () => {
  beforeEach(() => {
    mocks.invoke.mockClear()
    mocks.toast.mockClear()
    mocks.watchlist = []
    document.body.innerHTML = ''
  })

  it('点击席位股票行打开分时视图，并可加入自选', async () => {
    const container = mount()
    await flush()

    const row = container.querySelector<HTMLElement>('.seat-op-row')
    expect(row).not.toBeNull()
    // 中文名直接来自后端（报表本身没有名称列，靠行情接口补齐）
    expect(row!.textContent).toContain('万邦医药')

    row!.click()
    await flush()

    const addBtn = container.querySelector<HTMLButtonElement>('.stv-primary-btn')
    expect(addBtn).not.toBeNull()
    expect(addBtn!.textContent).toContain('加入自选')

    addBtn!.click()
    await flush()

    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    const [command, payload] = mocks.invoke.mock.calls[0] as [string, { cfg: { watchlist: unknown[] } }]
    expect(command).toBe('save_config')
    expect(payload.cfg.watchlist).toHaveLength(1)
    expect(mocks.toast).toHaveBeenCalled()
  })

  it('已在自选时给出提示，且不再重复写入配置', async () => {
    mocks.watchlist = [{ code: 'sz301520', name: '万邦医药', group: 'default' }]

    const container = mount()
    await flush()

    container.querySelector<HTMLElement>('.seat-op-row')!.click()
    await flush()

    const addedBtn = container.querySelector<HTMLButtonElement>('.stv-added-btn')
    expect(addedBtn).not.toBeNull()
    expect(addedBtn!.textContent).toContain('已在自选')

    addedBtn!.click()
    await flush()

    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('已在自选中'))
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
