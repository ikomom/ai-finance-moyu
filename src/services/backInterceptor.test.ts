import { beforeEach, describe, expect, it } from 'vitest'
import { createRoot, createSignal } from 'solid-js'
import {
  clearBackInterceptorsForTest,
  hasActiveBackInterceptor,
  registerBackInterceptor,
  tryConsumeBack,
  useBackInterceptor,
} from './backInterceptor'

describe('backInterceptor LIFO stack', () => {
  beforeEach(() => {
    clearBackInterceptorsForTest()
  })

  it('invokes interceptors in LIFO order and stops after consumption', () => {
    const calls: string[] = []
    registerBackInterceptor(() => {
      calls.push('bottom')
    })
    const unregisterTop = registerBackInterceptor(() => {
      calls.push('top')
    })

    expect(hasActiveBackInterceptor()).toBe(true)
    expect(tryConsumeBack()).toBe(true)
    expect(calls).toEqual(['top'])

    // Idempotent unregister removes top layer so bottom layer handles next back
    unregisterTop()
    unregisterTop()
    expect(tryConsumeBack()).toBe(true)
    expect(calls).toEqual(['top', 'bottom'])
  })

  it('removes middle interceptor cleanly without affecting order', () => {
    const calls: string[] = []
    registerBackInterceptor(() => {
      calls.push('first')
    })
    const unregisterMid = registerBackInterceptor(() => {
      calls.push('second')
    })
    registerBackInterceptor(() => {
      calls.push('third')
      return false // pass through
    })

    unregisterMid()
    expect(tryConsumeBack()).toBe(true)
    expect(calls).toEqual(['third', 'first'])
  })

  it('returns false when stack is empty or all interceptors pass through', () => {
    expect(hasActiveBackInterceptor()).toBe(false)
    expect(tryConsumeBack()).toBe(false)

    registerBackInterceptor(() => false)
    expect(hasActiveBackInterceptor()).toBe(true)
    expect(tryConsumeBack()).toBe(false)
  })

  it('reactively registers and unregisters via useBackInterceptor', () => {
    const calls: string[] = []

    createRoot((dispose) => {
      const [open, setOpen] = createSignal(false)
      useBackInterceptor(open, () => {
        calls.push('modal')
        setOpen(false)
      })

      expect(hasActiveBackInterceptor()).toBe(false)
      expect(tryConsumeBack()).toBe(false)

      setOpen(true)
      expect(hasActiveBackInterceptor()).toBe(true)
      expect(tryConsumeBack()).toBe(true)
      expect(calls).toEqual(['modal'])
      expect(hasActiveBackInterceptor()).toBe(false)

      setOpen(true)
      expect(hasActiveBackInterceptor()).toBe(true)
      dispose()
      expect(hasActiveBackInterceptor()).toBe(false)
    })
  })

  it('keeps stack position stable when active() re-evaluates while staying true', () => {
    const calls: string[] = []

    createRoot((dispose) => {
      const [tick, setTick] = createSignal(0)
      const [innerOpen, setInnerOpen] = createSignal(false)

      useBackInterceptor(() => tick() >= 0, () => {
        calls.push('outer')
      })
      useBackInterceptor(innerOpen, () => {
        calls.push('inner')
        setInnerOpen(false)
      })

      setInnerOpen(true)
      // Re-evaluating outer signal while staying truthy must NOT reorder outer above inner
      setTick(1)

      expect(tryConsumeBack()).toBe(true)
      expect(calls).toEqual(['inner'])
      dispose()
    })
  })
})
