import type { Layout } from '../types'

export type MiniViewMode = 'trend' | 'five_day' | 'kline' | 'auction'

export interface ViewState {
  layout: Layout
  code?: string
  mode?: MiniViewMode
  groupId?: string | null
}

export interface ApplyStateOptions {
  layoutChanged?: boolean
}

export interface HistoryNavigator {
  getCurrentState: () => ViewState | null
  applyState: (state: ViewState, opts?: ApplyStateOptions) => void
}

const MAX_HISTORY = 20
const PENDING_LAYOUT_TTL_MS = 1500

const viewBackStack: ViewState[] = []
const viewForwardStack: ViewState[] = []
let currentTracked: ViewState | null = null
let pendingLayout: { target: Layout; expiresAt: number } | null = null

function normGroup(groupId?: string | null): string {
  return groupId || 'all'
}

function normCode(code?: string): string {
  return (code ?? '').toLowerCase()
}

export function isSameViewLocation(a: ViewState, b: ViewState): boolean {
  if (a.layout !== b.layout) return false
  switch (a.layout) {
    case 'mini':
      return normCode(a.code) === normCode(b.code) && normGroup(a.groupId) === normGroup(b.groupId)
    case 'global':
      return normCode(a.code) === normCode(b.code)
    case 'list':
    case 'bar':
      return normGroup(a.groupId) === normGroup(b.groupId)
    case 'market':
      return true
  }
}

function pushUnique(stack: ViewState[], state: ViewState): void {
  const top = stack[stack.length - 1]
  if (!top || !isSameViewLocation(top, state)) {
    stack.push({ ...state })
    if (stack.length > MAX_HISTORY) {
      stack.shift()
    }
  }
}

function resolveCurrentState(nav: HistoryNavigator): ViewState | null {
  if (pendingLayout && Date.now() <= pendingLayout.expiresAt && currentTracked) {
    return { ...currentTracked }
  }
  pendingLayout = null
  return nav.getCurrentState() ?? (currentTracked ? { ...currentTracked } : null)
}

export function setInitialViewState(state: ViewState): void {
  currentTracked = { ...state }
  pendingLayout = null
}

export function recordExplicitJump(
  fromState: ViewState,
  toState: ViewState,
  opts?: { expectLayoutSnapshot?: boolean; alreadySwitchedFrom?: Layout }
): void {
  if (
    opts?.alreadySwitchedFrom &&
    opts.alreadySwitchedFrom !== toState.layout &&
    fromState.layout === toState.layout
  ) {
    // Notification snapshot beat `navigate_stock` event: original layout was already pushed by recordLayoutChange.
    viewForwardStack.length = 0
    pendingLayout = null
    currentTracked = { ...toState }
    return
  }

  if (isSameViewLocation(fromState, toState)) {
    currentTracked = { ...toState }
    if (opts?.expectLayoutSnapshot) {
      pendingLayout = { target: toState.layout, expiresAt: Date.now() + PENDING_LAYOUT_TTL_MS }
    }
    return
  }

  pushUnique(viewBackStack, fromState)
  viewForwardStack.length = 0
  currentTracked = { ...toState }

  if (toState.layout !== fromState.layout || opts?.expectLayoutSnapshot) {
    pendingLayout = { target: toState.layout, expiresAt: Date.now() + PENDING_LAYOUT_TTL_MS }
  } else {
    pendingLayout = null
  }
}

export function recordLayoutChange(newLayout: Layout, liveFromState?: ViewState): void {
  if (pendingLayout) {
    if (Date.now() > pendingLayout.expiresAt) {
      pendingLayout = null
    } else if (newLayout === pendingLayout.target) {
      pendingLayout = null
      currentTracked = currentTracked
        ? { ...currentTracked, layout: newLayout }
        : liveFromState
          ? { ...liveFromState, layout: newLayout }
          : { layout: newLayout }
      return
    } else {
      // Stale snapshot from a prior layout poll or intermediate group save while switching layouts.
      return
    }
  }

  if (!currentTracked) {
    currentTracked = liveFromState ? { ...liveFromState, layout: newLayout } : { layout: newLayout }
    return
  }

  if (currentTracked.layout === newLayout) {
    return
  }

  const from: ViewState = liveFromState
    ? { ...liveFromState, layout: currentTracked.layout }
    : { ...currentTracked }
  pushUnique(viewBackStack, from)
  viewForwardStack.length = 0
  currentTracked = { layout: newLayout, groupId: from.groupId }
}

export function navigateBack(nav: HistoryNavigator): void {
  const current = resolveCurrentState(nav)
  if (!current) return

  while (
    viewBackStack.length > 0 &&
    isSameViewLocation(viewBackStack[viewBackStack.length - 1], current)
  ) {
    viewBackStack.pop()
  }

  if (viewBackStack.length > 0) {
    const prev = viewBackStack.pop()!
    pushUnique(viewForwardStack, current)
    const layoutChanged = prev.layout !== current.layout
    currentTracked = { ...prev }
    if (layoutChanged) {
      pendingLayout = { target: prev.layout, expiresAt: Date.now() + PENDING_LAYOUT_TTL_MS }
    }
    nav.applyState(prev, { layoutChanged })
  } else if (current.layout === 'mini') {
    pushUnique(viewForwardStack, current)
    const fallbackState: ViewState = { layout: 'list', groupId: current.groupId }
    currentTracked = { ...fallbackState }
    pendingLayout = { target: 'list', expiresAt: Date.now() + PENDING_LAYOUT_TTL_MS }
    nav.applyState(fallbackState, { layoutChanged: true })
  }
}

export function navigateForward(nav: HistoryNavigator): void {
  const current = resolveCurrentState(nav)
  if (!current) return

  while (
    viewForwardStack.length > 0 &&
    isSameViewLocation(viewForwardStack[viewForwardStack.length - 1], current)
  ) {
    viewForwardStack.pop()
  }

  if (viewForwardStack.length > 0) {
    const next = viewForwardStack.pop()!
    pushUnique(viewBackStack, current)
    const layoutChanged = next.layout !== current.layout
    currentTracked = { ...next }
    if (layoutChanged) {
      pendingLayout = { target: next.layout, expiresAt: Date.now() + PENDING_LAYOUT_TTL_MS }
    }
    nav.applyState(next, { layoutChanged })
  }
}

export function clearHistoryForTest(): void {
  viewBackStack.length = 0
  viewForwardStack.length = 0
  currentTracked = null
  pendingLayout = null
}
