import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearHistoryForTest,
  navigateBack,
  navigateForward,
  recordExplicitJump,
  recordLayoutChange,
  setInitialViewState,
  type ViewState,
} from './viewHistory'

describe('viewHistory navigation stack', () => {
  let currentState: ViewState
  const appliedStates: ViewState[] = []

  const nav = {
    getCurrentState: () => currentState,
    applyState: (s: ViewState) => {
      appliedStates.push(s)
      currentState = s
    },
  }

  beforeEach(() => {
    clearHistoryForTest()
    appliedStates.length = 0
    currentState = { layout: 'mini', code: 'sh600522', groupId: 'default' }
    setInitialViewState(currentState)
  })

  it('records explicit jump and navigates back to previous stock in mini layout', () => {
    // Current stock is sh600522. Notification jumps to sz000592.
    const jumpTarget: ViewState = { layout: 'mini', code: 'sz000592', groupId: 'default' }
    recordExplicitJump(currentState, jumpTarget)
    currentState = jumpTarget

    // Click shoulder back button
    navigateBack(nav)

    expect(appliedStates).toHaveLength(1)
    expect(appliedStates[0]).toEqual({ layout: 'mini', code: 'sh600522', groupId: 'default' })
    expect(currentState.code).toBe('sh600522')

    // Click shoulder forward button to return to notification stock
    navigateForward(nav)
    expect(appliedStates).toHaveLength(2)
    expect(appliedStates[1]).toEqual({ layout: 'mini', code: 'sz000592', groupId: 'default' })
    expect(currentState.code).toBe('sz000592')
  })

  it('navigates back to previous layout if jump originated from another layout', () => {
    currentState = { layout: 'list', code: 'sh600825', groupId: 'default' }
    setInitialViewState(currentState)

    const jumpTarget: ViewState = { layout: 'mini', code: 'sz000592', groupId: 'default' }
    recordExplicitJump(currentState, jumpTarget)
    currentState = jumpTarget

    navigateBack(nav)
    expect(appliedStates).toHaveLength(1)
    expect(appliedStates[0]).toEqual({ layout: 'list', code: 'sh600825', groupId: 'default' })
  })

  it('falls back to list layout if history stack is empty and currently in mini', () => {
    // Stack is empty
    navigateBack(nav)
    expect(appliedStates).toHaveLength(1)
    expect(appliedStates[0].layout).toBe('list')
  })

  it('does nothing if history stack is empty and already in list layout', () => {
    currentState = { layout: 'list' }
    setInitialViewState(currentState)

    navigateBack(nav)
    expect(appliedStates).toHaveLength(0)
  })

  it('handles multiple consecutive layout changes with max limit', () => {
    for (let i = 0; i < 25; i++) {
      const layout = i % 2 === 0 ? 'list' : 'mini'
      recordLayoutChange(layout, { layout })
      currentState = { layout }
    }
    // Should navigate back up to 20 times without throwing
    let count = 0
    while (count < 20) {
      navigateBack(nav)
      count++
    }
    expect(appliedStates.length).toBe(20)
  })
})
