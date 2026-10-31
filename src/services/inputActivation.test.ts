// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 挂件窗口 `focusable: false`，输入框默认收不到按键；这里验证"点进输入框就临时激活"的链路。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

import { invoke } from '@tauri-apps/api/core'

type Cleanup = () => void
let cleanup: Cleanup | undefined

async function setup() {
  // inTauri() 依赖这个标记
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: {},
    configurable: true,
  })
  const { installInputActivation } = await import('./inputActivation')
  cleanup = installInputActivation({ releaseDelayMs: 0 })
}

const focusableCalls = () =>
  (invoke as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => c[0] === 'set_widget_focusable'
  )

describe('installInputActivation', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    document.body.innerHTML = '<input id="a" /><input id="b" /><button id="btn">ok</button>'
    await setup()
  })

  afterEach(() => {
    cleanup?.()
    cleanup = undefined
    document.body.innerHTML = ''
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  })

  it('按下输入框时把窗口切成可聚焦', () => {
    document.getElementById('a')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(focusableCalls()).toHaveLength(1)
    expect(focusableCalls()[0][1]).toEqual({ focusable: true })
  })

  it('点普通按钮不会激活窗口', () => {
    document.getElementById('btn')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(focusableCalls()).toHaveLength(0)
  })

  it('焦点离开输入框后关回不可聚焦', async () => {
    const input = document.getElementById('a') as HTMLInputElement
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    input.focus()

    document.getElementById('btn')!.focus()
    await new Promise((r) => setTimeout(r, 5))

    const calls = focusableCalls()
    expect(calls[calls.length - 1][1]).toEqual({ focusable: false })
  })
})
