// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearBackInterceptorsForTest,
  registerBackInterceptor,
} from '../services/backInterceptor'
import { setupWidgetNavigation } from './widgetInteraction'

describe('setupWidgetNavigation capture-phase side buttons', () => {
  let cleanup: (() => void) | undefined
  let onBack: ReturnType<typeof vi.fn>
  let onForward: ReturnType<typeof vi.fn>
  let collapsed = false

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-25T10:00:00Z'))
    clearBackInterceptorsForTest()
    collapsed = false
    onBack = vi.fn()
    onForward = vi.fn()
    cleanup = setupWidgetNavigation({
      isCollapsed: () => collapsed,
      onBack: onBack as () => void,
      onForward: onForward as () => void,
    })
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    document.body.innerHTML = ''
    clearBackInterceptorsForTest()
    vi.useRealTimers()
  })

  it('intercepts side buttons in capture phase even when child calls stopPropagation', () => {
    const child = document.createElement('div')
    const childMouseDown = vi.fn((e: MouseEvent) => e.stopPropagation())
    const childMouseUp = vi.fn((e: MouseEvent) => e.stopPropagation())
    child.addEventListener('mousedown', childMouseDown)
    child.addEventListener('mouseup', childMouseUp)
    document.body.appendChild(child)

    const pointerDownEvt = new MouseEvent('pointerdown', { button: 3, bubbles: true, cancelable: true })
    const downEvt = new MouseEvent('mousedown', { button: 3, bubbles: true, cancelable: true })
    const upEvt = new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true })
    child.dispatchEvent(pointerDownEvt)
    child.dispatchEvent(downEvt)
    child.dispatchEvent(upEvt)

    expect(downEvt.defaultPrevented).toBe(true)
    expect(upEvt.defaultPrevented).toBe(true)
    expect(childMouseDown).not.toHaveBeenCalled()
    expect(childMouseUp).not.toHaveBeenCalled()
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('ignores side buttons and BrowserBack/Forward when collapsed', () => {
    collapsed = true
    const upBack = new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true })
    const keyFwd = new KeyboardEvent('keydown', { key: 'BrowserForward', bubbles: true, cancelable: true })

    document.body.dispatchEvent(upBack)
    document.body.dispatchEvent(keyFwd)

    expect(upBack.defaultPrevented).toBe(true)
    expect(keyFwd.defaultPrevented).toBe(true)
    expect(onBack).not.toHaveBeenCalled()
    expect(onForward).not.toHaveBeenCalled()
  })

  it('consumes active back interceptor first and locks forward while overlay is open', () => {
    let overlayClosed = false
    const unregister = registerBackInterceptor(() => {
      overlayClosed = true
      unregister()
    })

    // Forward is blocked while interceptor is active
    document.body.dispatchEvent(new MouseEvent('mouseup', { button: 4, bubbles: true, cancelable: true }))
    expect(onForward).not.toHaveBeenCalled()

    // Back closes overlay without calling main view onBack
    document.body.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true }))
    expect(overlayClosed).toBe(true)
    expect(onBack).not.toHaveBeenCalled()

    // After debounce window, next back & forward hit main view handlers
    vi.advanceTimersByTime(60)
    document.body.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true }))
    expect(onBack).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60)
    document.body.dispatchEvent(new MouseEvent('mouseup', { button: 4, bubbles: true, cancelable: true }))
    expect(onForward).toHaveBeenCalledTimes(1)
  })

  it('deduplicates rapid hardware bounce or mouseup+BrowserBack within 50ms', () => {
    document.body.dispatchEvent(new MouseEvent('mouseup', { button: 3, bubbles: true, cancelable: true }))
    vi.advanceTimersByTime(10)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true, cancelable: true }))

    expect(onBack).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(55)
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'BrowserBack', bubbles: true, cancelable: true }))
    expect(onBack).toHaveBeenCalledTimes(2)
  })
})
