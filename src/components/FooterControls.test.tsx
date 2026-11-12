// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render } from 'solid-js/web'
import { FooterControls, KLINE_PERIODS } from './FooterControls'

describe('FooterControls', () => {
  it('renders default subchart buttons and view mode buttons', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onToggleView = vi.fn()
    const onSelectPeriod = vi.fn()

    render(
      () => (
        <FooterControls
          viewMode="trend"
          onToggleView={onToggleView}
          klinePeriod="day"
          onSelectPeriod={onSelectPeriod}
        />
      ),
      container
    )

    const buttons = container.querySelectorAll('button')
    const texts = Array.from(buttons).map((b) => b.textContent?.trim())
    expect(texts).toContain('分时')
    expect(texts).toContain('日K')
    expect(texts).toContain('▾')
  })

  it('renders active period label (e.g. 60分 and 120分)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      () => (
        <FooterControls
          viewMode="kline"
          onToggleView={() => {}}
          klinePeriod="60m"
          onSelectPeriod={() => {}}
        />
      ),
      container
    )

    const mainBtn = container.querySelector('.mode-pill.kline-main-pill')
    expect(mainBtn?.textContent?.trim()).toBe('60分')
    expect(mainBtn?.classList.contains('active')).toBe(true)
  })

  it('toggles period popover on arrow click and triggers onSelectPeriod', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    const onToggleView = vi.fn()
    const onSelectPeriod = vi.fn()

    render(
      () => (
        <FooterControls
          viewMode="trend"
          onToggleView={onToggleView}
          klinePeriod="day"
          onSelectPeriod={onSelectPeriod}
        />
      ),
      container
    )

    const arrowBtn = container.querySelector('.mode-pill.kline-arrow-pill') as HTMLButtonElement
    expect(arrowBtn).not.toBeNull()

    // Popover initially closed
    expect(container.querySelector('.kline-period-popover')).toBeNull()

    // Click arrow to open
    arrowBtn.click()
    const popover = container.querySelector('.kline-period-popover')
    expect(popover).not.toBeNull()

    // Verify all 6 period items exist
    const periodButtons = popover!.querySelectorAll('.period-item')
    expect(periodButtons.length).toBe(KLINE_PERIODS.length)
    expect(periodButtons.length).toBe(6)

    // Click 120分
    const btn120 = Array.from(periodButtons).find((b) => b.textContent?.trim() === '120分') as HTMLButtonElement
    expect(btn120).not.toBeNull()
    btn120.click()

    expect(onSelectPeriod).toHaveBeenCalledWith('120m')
    expect(onToggleView).toHaveBeenCalledWith('kline')
    // Popover closes after selection
    expect(container.querySelector('.kline-period-popover')).toBeNull()
  })

  it('toggles five_day mode and trend mode correctly', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onToggleView = vi.fn()

    render(
      () => (
        <FooterControls
          viewMode="five_day"
          onToggleView={onToggleView}
          klinePeriod="day"
        />
      ),
      container
    )

    const trendBtn = container.querySelector('.mode-pill.trend-main-pill') as HTMLButtonElement
    expect(trendBtn?.textContent?.trim()).toBe('5日')
    expect(trendBtn?.classList.contains('active')).toBe(true)

    trendBtn.click()
    expect(onToggleView).toHaveBeenCalledWith('trend')
  })

  it('restores saved five_day submode when returning from kline view', () => {
    localStorage.setItem('trend_view_submode', 'five_day')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onToggleView = vi.fn()

    render(
      () => (
        <FooterControls
          viewMode="kline"
          onToggleView={onToggleView}
          klinePeriod="day"
        />
      ),
      container
    )

    const trendBtn = container.querySelector('.mode-pill.trend-main-pill') as HTMLButtonElement
    expect(trendBtn?.textContent?.trim()).toBe('5日')

    trendBtn.click()
    expect(onToggleView).toHaveBeenCalledWith('five_day')
  })
})
