// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render } from 'solid-js/web'
import { SeatEntityCard } from './SeatEntityCard'
import { SeatAddBar } from './SeatAddBar'
import type { FocusSeatEntity } from './seatEntities'

describe('Seat UI components', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const dummyEntity: FocusSeatEntity = {
    id: 'e-1',
    name: '呼家楼',
    category: 'trader',
    enabled: true,
    branches: [
      { id: 'b-1', keyword: '北京东城分公司', enabled: true },
      { id: 'b-2', keyword: '北京呼家楼', enabled: true },
    ],
    desc: '中信建投北京东城分公司',
  }

  it('renders SeatEntityCard with name, category dropdown arrow, and branch preview', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      () => (
        <SeatEntityCard
          entity={dummyEntity}
          onToggleEntity={vi.fn()}
          onDeleteEntity={vi.fn()}
          onAddBranch={vi.fn()}
          onDeleteBranch={vi.fn()}
          onChangeCategory={vi.fn()}
        />
      ),
      container
    )

    expect(container.querySelector('.seat-card-name')?.textContent).toBe('呼家楼')
    expect(container.querySelector('.seat-badge-pill')?.textContent).toContain('游资')
    expect(container.querySelector('.seat-badge-arrow')?.textContent).toBe('▾')
    expect(container.querySelector('.seat-preview-chip')?.textContent).toBe('北京东城分公司')
    expect(container.querySelector('.seat-toggle-switch.active')).not.toBeNull()
    expect(container.querySelector('.seat-card-del-btn')?.textContent).toContain('🗑️')
  })

  it('renders SeatAddBar with input placeholder', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)

    render(
      () => (
        <SeatAddBar
          existingNames={['呼家楼']}
          onAddEntity={vi.fn()}
          onSay={vi.fn()}
        />
      ),
      container
    )

    const input = container.querySelector<HTMLInputElement>('.seat-query-input')
    expect(input).not.toBeNull()
    expect(input?.placeholder).toContain('快速搜索或输入游资/营业部')
  })
})
