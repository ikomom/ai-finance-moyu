// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { adjustPopoverPosition } from './popoverPosition'

describe('adjustPopoverPosition', () => {
  it('does not throw when elements are null or undefined', () => {
    expect(() => adjustPopoverPosition(null, null)).not.toThrow()
  })

  it('adjusts left position when popover overflows right edge', async () => {
    const wrap = document.createElement('div')
    const popover = document.createElement('div')
    document.body.appendChild(wrap)
    wrap.appendChild(popover)

    // Mock getBoundingClientRect
    wrap.getBoundingClientRect = () => ({
      left: 200,
      right: 250,
      top: 10,
      bottom: 30,
      width: 50,
      height: 20,
      x: 200,
      y: 10,
      toJSON: () => {},
    })

    Object.defineProperty(popover, 'offsetWidth', { value: 308, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })

    adjustPopoverPosition(wrap, popover)

    await new Promise((resolve) => requestAnimationFrame(resolve))

    // 200 + 308 = 508. Overflow = 508 - (320 - 8) = 196. Shift = min(196, 200 - 8) = 192.
    expect(popover.style.left).toBe('-192px')

    document.body.removeChild(wrap)
  })
})
