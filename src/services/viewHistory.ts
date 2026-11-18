import type { Layout } from '../types'

export interface ViewState {
  layout: Layout
  code?: string
  mode?: 'trend' | 'kline' | 'auction'
  groupId?: string | null
}

export interface HistoryNavigator {
  getCurrentState: () => ViewState | null
  applyState: (state: ViewState) => void
}

const MAX_HISTORY = 20
const viewBackStack: ViewState[] = []
const viewForwardStack: ViewState[] = []
let isNavigatingHistory = false
let lastState: ViewState | null = null

export function setInitialViewState(state: ViewState): void {
  lastState = { ...state }
}

export function recordExplicitJump(fromState: ViewState, toState?: ViewState): void {
  if (isNavigatingHistory) {
    isNavigatingHistory = false
    if (toState) lastState = { ...toState }
    return
  }
  const top = viewBackStack[viewBackStack.length - 1]
  if (
    !top ||
    top.layout !== fromState.layout ||
    top.code !== fromState.code ||
    top.groupId !== fromState.groupId
  ) {
    viewBackStack.push(fromState)
    if (viewBackStack.length > MAX_HISTORY) {
      viewBackStack.shift()
    }
  }
  viewForwardStack.length = 0
  if (toState) {
    lastState = { ...toState }
  }
}

export function recordLayoutChange(newLayout: Layout, currentState?: ViewState): void {
  if (!lastState) {
    lastState = currentState ?? { layout: newLayout }
    return
  }
  if (lastState.layout === newLayout) {
    return
  }
  if (isNavigatingHistory) {
    lastState = { ...lastState, layout: newLayout }
    isNavigatingHistory = false
    return
  }
  const fromState = currentState ?? { ...lastState }
  const top = viewBackStack[viewBackStack.length - 1]
  if (
    !top ||
    top.layout !== fromState.layout ||
    top.code !== fromState.code ||
    top.groupId !== fromState.groupId
  ) {
    viewBackStack.push(fromState)
    if (viewBackStack.length > MAX_HISTORY) {
      viewBackStack.shift()
    }
  }
  viewForwardStack.length = 0
  lastState = { ...(currentState ?? lastState), layout: newLayout }
}

export function navigateBack(nav: HistoryNavigator): void {
  const current = nav.getCurrentState()
  if (!current) return

  if (viewBackStack.length > 0) {
    const prev = viewBackStack.pop()!
    viewForwardStack.push(current)
    if (viewForwardStack.length > MAX_HISTORY) {
      viewForwardStack.shift()
    }
    isNavigatingHistory = true
    lastState = { ...prev }
    nav.applyState(prev)
  } else if (current.layout !== 'list') {
    viewForwardStack.push(current)
    if (viewForwardStack.length > MAX_HISTORY) {
      viewForwardStack.shift()
    }
    isNavigatingHistory = true
    const fallbackState: ViewState = { layout: 'list', groupId: current.groupId }
    lastState = { ...fallbackState }
    nav.applyState(fallbackState)
  }
}

export function navigateForward(nav: HistoryNavigator): void {
  const current = nav.getCurrentState()
  if (!current) return

  if (viewForwardStack.length > 0) {
    const next = viewForwardStack.pop()!
    viewBackStack.push(current)
    if (viewBackStack.length > MAX_HISTORY) {
      viewBackStack.shift()
    }
    isNavigatingHistory = true
    lastState = { ...next }
    nav.applyState(next)
  }
}

export function clearHistoryForTest(): void {
  viewBackStack.length = 0
  viewForwardStack.length = 0
  lastState = null
  isNavigatingHistory = false
}
