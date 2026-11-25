import { beforeEach, describe, expect, it } from 'vitest'
import { createLinearHistory } from './tabHistory'
import {
  clearHistoryForTest,
  navigateBack,
  navigateForward,
  recordExplicitJump,
  recordLayoutChange,
  setInitialViewState,
  type ApplyStateOptions,
  type ViewState,
} from './viewHistory'

describe('viewHistory navigation stack', () => {
  let currentState: ViewState
  const appliedStates: Array<{ state: ViewState; opts?: ApplyStateOptions }> = []

  const nav = {
    getCurrentState: () => currentState,
    applyState: (s: ViewState, opts?: ApplyStateOptions) => {
      appliedStates.push({ state: s, opts })
      currentState = s
    },
  }

  beforeEach(() => {
    clearHistoryForTest()
    appliedStates.length = 0
    currentState = { layout: 'mini', code: 'sh600522', mode: 'trend', groupId: 'default' }
    setInitialViewState(currentState)
  })

  it('records explicit jump and navigates back/forward in mini layout', () => {
    const jumpTarget: ViewState = { layout: 'mini', code: 'sz000592', mode: 'trend', groupId: 'default' }
    recordExplicitJump(currentState, jumpTarget)
    currentState = jumpTarget

    navigateBack(nav)
    expect(appliedStates).toHaveLength(1)
    expect(appliedStates[0].state).toEqual({
      layout: 'mini',
      code: 'sh600522',
      mode: 'trend',
      groupId: 'default',
    })
    expect(appliedStates[0].opts?.layoutChanged).toBe(false)

    navigateForward(nav)
    expect(appliedStates).toHaveLength(2)
    expect(appliedStates[1].state).toEqual(jumpTarget)
  })

  it('does not lock out subsequent layout changes after a same-layout back navigation (regression)', () => {
    // 1. Jump within mini and go back (same layout)
    const stockB: ViewState = { layout: 'mini', code: 'sz000592', mode: 'trend', groupId: 'default' }
    recordExplicitJump(currentState, stockB)
    currentState = stockB
    navigateBack(nav)
    expect(currentState.code).toBe('sh600522')

    // 2. Subsequent external layout switch to market MUST still be pushed to back stack
    recordLayoutChange('market', currentState)
    currentState = { layout: 'market' }

    navigateBack(nav)
    expect(appliedStates).toHaveLength(2)
    expect(appliedStates[1].state).toEqual({
      layout: 'mini',
      code: 'sh600522',
      mode: 'trend',
      groupId: 'default',
    })
  })

  it('ignores stale intermediate snapshots during cross-layout back without ping-pong', () => {
    currentState = { layout: 'list', code: 'sh600825', groupId: 'default' }
    setInitialViewState(currentState)

    const miniTarget: ViewState = { layout: 'mini', code: 'sz000592', mode: 'trend', groupId: 'default' }
    recordExplicitJump(currentState, miniTarget, { expectLayoutSnapshot: true })
    currentState = miniTarget
    // Backend confirms mini snapshot
    recordLayoutChange('mini', currentState)

    // Press Back -> backend hasn't emitted 'list' yet; simulate stale 'mini' poll arriving first
    const delayedNav = {
      getCurrentState: () => currentState,
      applyState: (s: ViewState) => {
        appliedStates.push({ state: s })
        // Async: currentState doesn't flip immediately
      },
    }
    navigateBack(delayedNav)
    expect(appliedStates[0].state.layout).toBe('list')

    // Stale 'mini' snapshot arrives while waiting for 'list' -> MUST NOT push to back stack or clear forward stack
    recordLayoutChange('mini', currentState)
    // Target 'list' snapshot arrives
    currentState = appliedStates[0].state
    recordLayoutChange('list', currentState)

    // Forward must still work!
    navigateForward(nav)
    expect(appliedStates).toHaveLength(2)
    expect(appliedStates[1].state).toEqual(miniTarget)
  })

  it('supports rapid consecutive back clicks before async set_layout snapshots arrive', () => {
    currentState = { layout: 'list', groupId: 'default' }
    setInitialViewState(currentState)

    // list -> market
    recordLayoutChange('market', currentState)
    currentState = { layout: 'market', groupId: 'default' }

    // market -> mini
    const miniTarget: ViewState = { layout: 'mini', code: 'sz000592', mode: 'kline', groupId: 'default' }
    recordExplicitJump(currentState, miniTarget, { expectLayoutSnapshot: true })
    currentState = miniTarget
    recordLayoutChange('mini', currentState)

    // Rapid double-back while frontend snapshot is still frozen at mini
    const staleSnapshotNav = {
      getCurrentState: () => currentState,
      applyState: (s: ViewState, opts?: ApplyStateOptions) => {
        appliedStates.push({ state: s, opts })
      },
    }

    navigateBack(staleSnapshotNav)
    navigateBack(staleSnapshotNav)

    expect(appliedStates).toHaveLength(2)
    expect(appliedStates[0].state.layout).toBe('market')
    expect(appliedStates[1].state.layout).toBe('list')

    // Late 'market' snapshot arrives first -> ignored; final 'list' arrives -> confirmed
    recordLayoutChange('market')
    currentState = appliedStates[1].state
    recordLayoutChange('list', currentState)

    // Forward twice restores market then mini (with kline mode intact)
    navigateForward(nav)
    expect(currentState.layout).toBe('market')
    navigateForward(nav)
    expect(currentState).toEqual(miniTarget)
  })

  it('deduplicates repeated jumps to the same location so back never no-ops', () => {
    const stockB: ViewState = { layout: 'mini', code: 'sz000592', mode: 'trend', groupId: 'default' }
    recordExplicitJump(currentState, stockB)
    currentState = stockB
    // Repeated jump to same stock (e.g. clicking same notification twice)
    recordExplicitJump(currentState, { layout: 'mini', code: 'sz000592', mode: 'kline', groupId: 'default' })
    currentState = { layout: 'mini', code: 'sz000592', mode: 'kline', groupId: 'default' }

    navigateBack(nav)
    expect(appliedStates).toHaveLength(1)
    expect(appliedStates[0].state.code).toBe('sh600522')
  })

  it('preserves mini mode (kline / five_day) across layout jumps and back', () => {
    currentState = { layout: 'mini', code: 'sh600522', mode: 'kline', groupId: 'default' }
    setInitialViewState(currentState)

    const target: ViewState = { layout: 'mini', code: 'sz000592', mode: 'trend', groupId: 'default' }
    recordExplicitJump(currentState, target)
    currentState = target

    navigateBack(nav)
    expect(appliedStates[0].state).toEqual({
      layout: 'mini',
      code: 'sh600522',
      mode: 'kline',
      groupId: 'default',
    })
  })

  it('handles out-of-order notification snapshot without double-pushing', () => {
    currentState = { layout: 'list', code: 'sh600825', groupId: 'default' }
    setInitialViewState(currentState)

    // Suppose apply_layout('mini') snapshot arrived before navigate_stock event
    recordLayoutChange('mini', currentState)
    currentState = { layout: 'mini', code: 'sh600825', groupId: 'default' }

    const target: ViewState = { layout: 'mini', code: 'sz000592', mode: 'trend', groupId: 'default' }
    recordExplicitJump(currentState, target, {
      expectLayoutSnapshot: true,
      alreadySwitchedFrom: 'list',
    })
    currentState = target

    // Single back click should go straight back to list, NOT an intermediate mini stock
    navigateBack(nav)
    expect(appliedStates).toHaveLength(1)
    expect(appliedStates[0].state).toEqual({
      layout: 'list',
      code: 'sh600825',
      groupId: 'default',
    })
  })

  it('falls back to list only from mini when back stack is empty', () => {
    navigateBack(nav)
    expect(appliedStates).toHaveLength(1)
    expect(appliedStates[0].state.layout).toBe('list')

    for (const layout of ['list', 'bar', 'market', 'global'] as const) {
      clearHistoryForTest()
      appliedStates.length = 0
      currentState = { layout }
      setInitialViewState(currentState)
      navigateBack(nav)
      expect(appliedStates).toHaveLength(0)
    }
  })

  it('handles multiple consecutive layout changes within max limit', () => {
    for (let i = 0; i < 25; i++) {
      const layout = i % 2 === 0 ? 'list' : 'mini'
      recordLayoutChange(layout, currentState)
      currentState = { layout }
    }
    let count = 0
    while (count < 20) {
      navigateBack(nav)
      count++
    }
    expect(appliedStates.length).toBe(20)
  })
})

describe('createLinearHistory for Settings tabs', () => {
  it('supports idempotent push, back/forward, and max size cap', () => {
    const h = createLinearHistory('watchlist', 3)
    h.push('watchlist') // no-op
    expect(h.back()).toBeNull()

    h.push('appearance')
    h.push('alerts')
    h.push('portfolio')
    h.push('ai')
    expect(h.current()).toBe('ai')

    // Max size 3: back stack holds [appearance, alerts, portfolio]
    expect(h.back()).toBe('portfolio')
    expect(h.back()).toBe('alerts')
    expect(h.back()).toBe('appearance')
    expect(h.back()).toBeNull()

    expect(h.forward()).toBe('alerts')
    // Idempotent push after navigation keeps forward stack intact
    h.push('alerts')
    expect(h.forward()).toBe('portfolio')

    // New branch clears forward stack
    h.push('system')
    expect(h.forward()).toBeNull()
    expect(h.back()).toBe('portfolio')
  })
})
