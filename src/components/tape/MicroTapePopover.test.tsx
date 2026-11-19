// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from 'solid-js/web'
import { MicroTapePopover } from './MicroTapePopover'
import type { Quote } from '../../types'

describe('MicroTapePopover', () => {
  const sampleStock: Quote = {
    code: 'sz000678',
    name: '襄阳轴承',
    price: 16.23,
    preClose: 15.22,
    open: 15.22,
    high: 16.74,
    low: 14.59,
    volume: 1209150,
    change: 1.01,
    changePct: 6.64,
    date: '20261119',
    time: '105842',
    turnoverRate: 26.31,
    amount: 1964300000,
    amplitude: 14.13,
    circulatingMarketCap: 74.59,
    volumeRatio: 2.67,
    avgPrice: 16.25,
    weibi: -21.38,
    outerVol: 512521,
    innerVol: 696307,
    activeBuyRatio: 0.424,
  }

  it('renders all key trading metrics for individual stocks', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      () => (
        <MicroTapePopover
          quote={sampleStock}
          isPinned={false}
          onClose={() => {}}
          onTogglePin={() => {}}
        />
      ),
      container
    )

    const text = container.textContent || ''
    expect(text).toContain('核心盘口')
    expect(text).toContain('襄阳轴承')
    expect(text).toContain('000678')
    expect(text).toContain('26.31%') // 换手率
    expect(text).toContain('19.64亿') // 成交额
    expect(text).toContain('2.67') // 量比
    expect(text).toContain('14.13%') // 振幅
    expect(text).toContain('74.59亿') // 流通市值
    expect(text).toContain('-21.38%') // 委比
    expect(text).toContain('16.25') // 均价
    expect(text).toContain('买方主动 42.4%')
    expect(text).toContain('卖方砸盘 57.6%')
  })

  it('triggers pin and close callbacks on button clicks', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onClose = vi.fn()
    const onTogglePin = vi.fn()

    render(
      () => (
        <MicroTapePopover
          quote={sampleStock}
          isPinned={true}
          onClose={onClose}
          onTogglePin={onTogglePin}
        />
      ),
      container
    )

    const pinBtn = container.querySelector('.tape-pin-btn') as HTMLButtonElement
    expect(pinBtn.textContent).toContain('已锁定')
    pinBtn.click()
    expect(onTogglePin).toHaveBeenCalled()

    const closeBtn = container.querySelector('.tape-close-btn') as HTMLButtonElement
    closeBtn.click()
    expect(onClose).toHaveBeenCalled()
  })

  it('handles index quotes gracefully', () => {
    const indexQuote: Quote = {
      code: 'sh000001',
      name: '上证指数',
      price: 3380.5,
      preClose: 3350.0,
      open: 3360.0,
      high: 3390.0,
      low: 3355.0,
      volume: 35000000,
      change: 30.5,
      changePct: 0.91,
      date: '20261119',
      time: '110000',
      amount: 450000000000,
      amplitude: 1.04,
      avgPrice: 3375.2,
    }

    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      () => (
        <MicroTapePopover
          quote={indexQuote}
          isPinned={false}
          onClose={() => {}}
        />
      ),
      container
    )

    const text = container.textContent || ''
    expect(text).toContain('上证指数')
    expect(text).toContain('4500.0亿')
    expect(text).toContain('1.04%')
    // Should not render stock-specific fields
    expect(text).not.toContain('换手率')
    expect(text).not.toContain('流通市值')
  })
})
