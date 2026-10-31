// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'solid-js/web'
import { SelectMenu } from './SelectMenu'

const OPTIONS = [
  { value: 'default', label: '默认自选' },
  { value: 'g2', label: '科技股' },
]

function mount(props: { value: string; onChange?: (v: string) => void }) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  render(
    () => (
      <SelectMenu
        value={props.value}
        options={OPTIONS}
        onChange={props.onChange ?? (() => {})}
        placement="up"
      />
    ),
    container
  )
  return container
}

const panel = () => document.querySelector('[data-select-panel]')

describe('SelectMenu', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('显示当前选中项的名称，而不是原始值', () => {
    const c = mount({ value: 'g2' })
    expect(c.querySelector('.select-menu-current')!.textContent).toBe('科技股')
  })

  it('展开后选中某项会回调并收起', () => {
    const onChange = vi.fn()
    const c = mount({ value: 'default', onChange })

    expect(panel()).toBeNull()
    c.querySelector('.select-menu-trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(panel()).not.toBeNull()
    expect(panel()!.className).toContain('is-up')

    const items = panel()!.querySelectorAll('.select-menu-item')
    expect(items).toHaveLength(2)

    ;(items[1] as HTMLButtonElement).click()
    expect(onChange).toHaveBeenCalledWith('g2')
    expect(panel()).toBeNull()
  })

  it('点空白处收起菜单', () => {
    const c = mount({ value: 'default' })
    c.querySelector('.select-menu-trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(panel()).not.toBeNull()

    document.body.click()
    expect(panel()).toBeNull()
  })

  it('选中同一项不重复触发回调', () => {
    const onChange = vi.fn()
    const c = mount({ value: 'default', onChange })
    c.querySelector('.select-menu-trigger')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    ;(panel()!.querySelectorAll('.select-menu-item')[0] as HTMLButtonElement).click()
    expect(onChange).not.toHaveBeenCalled()
  })
})
