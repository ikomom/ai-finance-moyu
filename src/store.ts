// Widget state.
//
// The backend replaces the whole snapshot on every poll, so a signal holding one
// immutable object is the right shape — Solid then updates only the DOM that
// actually depends on a changed field.

import { createSignal } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { inTauri } from './tauri'
import { ALL_GROUP_ID, DEFAULT_GROUP_ID, filterWatchlistByGroup } from './services/watchlistGroups'
import {
  navigateBack,
  navigateForward,
  recordExplicitJump,
  recordLayoutChange as recordHistoryLayoutChange,
  type ViewState,
} from './services/viewHistory'
import type { Layout, Snapshot } from './types'

export interface ToastAlert {
  message: string
  code?: string
  name?: string
  onClick?: () => void
}

const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null)
/** Which security the mini and list layouts detail. */
const [selected, setSelected] = createSignal(0)
/** Bumped when a threshold is crossed, so the card can flash. */
const [alertTick, setAlertTick] = createSignal(0)
/** Transient structured message shown at the bottom of the widget. */
const [toastAlert, setToastAlert] = createSignal<ToastAlert | null>(null)
const toastMsg = () => toastAlert()?.message ?? null
/** Discovered update version for non-intrusive notification */
const [newVersionAvailable, setNewVersionAvailable] = createSignal<string | null>(null)
/** Force mini layout to switch subchart mode on navigation */
const [miniModeOverride, setMiniModeOverride] = createSignal<'trend' | 'kline' | 'auction' | null>(null)

function getCurrentViewState(): ViewState | null {
  const s = snapshot()
  if (!s) return null
  const watchlist = s.config.watchlist
  const activeGroupId = s.config.activeGroupId ?? ALL_GROUP_ID
  const filtered = filterWatchlistByGroup(watchlist, activeGroupId)
  const currentCode = filtered[selectedIndex()]?.code
  return {
    layout: s.config.layout,
    code: currentCode,
    groupId: activeGroupId,
  }
}

function applyViewState(target: ViewState): void {
  const s = snapshot()
  if (!s) return
  const watchlist = s.config.watchlist

  const effectiveGroupId = target.groupId ?? s.config.activeGroupId ?? ALL_GROUP_ID
  if (s.config.activeGroupId !== effectiveGroupId) {
    void invoke('set_active_watch_group', { id: effectiveGroupId }).catch(() => {})
  }

  if (target.code) {
    const filtered = filterWatchlistByGroup(watchlist, effectiveGroupId)
    const idx = filtered.findIndex((w) => w.code.toLowerCase() === target.code!.toLowerCase())
    if (idx !== -1) {
      setSelected(idx)
    }
  }

  if (target.mode) {
    setMiniModeOverride(target.mode)
  }

  if (target.layout !== s.config.layout) {
    void invoke('set_layout', { layout: target.layout })
  } else {
    setSnapshot((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        config: {
          ...prev.config,
          activeGroupId: effectiveGroupId,
        },
      }
    })
  }
}

export function recordLayoutChange(newLayout: Layout): void {
  recordHistoryLayoutChange(newLayout, getCurrentViewState() ?? undefined)
}

export function navigateLayoutBack(): void {
  navigateBack({ getCurrentState: getCurrentViewState, applyState: applyViewState })
}

export function navigateLayoutForward(): void {
  navigateForward({ getCurrentState: getCurrentViewState, applyState: applyViewState })
}

export {
  alertTick,
  miniModeOverride,
  newVersionAvailable,
  selected,
  setMiniModeOverride,
  setNewVersionAvailable,
  setSelected,
  setSnapshot,
  snapshot,
  toastAlert,
  toastMsg,
}

/** Show a message briefly, then clear it (unless a newer one replaced it). */
export function showToast(msg: string, code?: string, name?: string, onClick?: () => void): void {
  setToastAlert({ message: msg, code, name, onClick })
  window.setTimeout(() => setToastAlert((curr) => (curr?.message === msg ? null : curr)), 5000)
}

/** Clear active toast immediately. */
export function clearToast(): void {
  setToastAlert(null)
}

/**
 * Navigate to a specific stock in Mini layout:
 * - Selects the stock in the watchlist
 * - Switches manualMode to the requested subchart (default 'trend')
 * - Expands the dock if collapsed
 * - Switches layout to mini and records layout change
 */
export function navigateToStock(code: string, mode: 'trend' | 'kline' | 'auction' = 'trend'): void {
  const s = snapshot()
  if (!s) return
  const watchlist = s.config.watchlist
  const targetItem = watchlist.find((w) => w.code.toLowerCase() === code.toLowerCase())
  if (!targetItem) return

  const activeGroupId = s.config.activeGroupId ?? ALL_GROUP_ID
  let effectiveGroupId = activeGroupId
  if (activeGroupId !== ALL_GROUP_ID && (targetItem.group ?? DEFAULT_GROUP_ID) !== activeGroupId) {
    effectiveGroupId = ALL_GROUP_ID
    void invoke('set_active_watch_group', { id: ALL_GROUP_ID }).catch(() => {})
  }

  const currentState = getCurrentViewState()
  if (currentState) {
    recordExplicitJump(currentState, {
      layout: 'mini',
      code: targetItem.code,
      mode,
      groupId: effectiveGroupId,
    })
  }

  const filtered = filterWatchlistByGroup(watchlist, effectiveGroupId)
  const idx = filtered.findIndex((w) => w.code.toLowerCase() === code.toLowerCase())
  if (idx !== -1) {
    setSelected(idx)
  }
  setMiniModeOverride(mode)

  if (s.config.layout !== 'mini') {
    recordLayoutChange('mini')
    void invoke('set_layout', { layout: 'mini' })
  } else {
    setSnapshot((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        config: {
          ...prev.config,
          activeGroupId: effectiveGroupId,
        },
      }
    })
    if (s.dock?.collapsed) {
      void invoke('set_dock_collapsed', { collapsed: false })
    }
  }
}

/**
 * The selection, clamped to the current watchlist. Derived rather than clamped
 * in place, so removing the selected stock can't leave a dangling index.
 */
export function selectedIndex(): number {
  const n = snapshot()?.quotes.length ?? 0
  if (n === 0) return 0
  return Math.min(Math.max(selected(), 0), n - 1)
}

/** Load initial state and subscribe to updates. Resolves to an error message. */
export async function initStore(): Promise<string | null> {
  if (!inTauri()) {
    // Loaded on demand so the ~330 lines of sample data never reach the bundle
    // that runs inside Tauri, where this branch is unreachable.
    const { demoSnapshot } = await import('./demo')
    const snap = demoSnapshot()
    setSnapshot(snap)
    recordLayoutChange(snap.config.layout)
    return null
  }

  try {
    const initial = await invoke<Snapshot>('get_snapshot')
    setSnapshot(initial)
    recordLayoutChange(initial.config.layout)
  } catch (e) {
    return String(e)
  }

  await listen<Snapshot>('snapshot', (e) => {
    recordLayoutChange(e.payload.config.layout)
    setSnapshot(e.payload)
  })
  await listen<Array<{ code: string; name: string; message: string }>>('alert', (e) => {
    setAlertTick((n) => n + 1)
    const first = e.payload?.[0]
    if (first?.message) {
      showToast(first.message, first.code, first.name)
    }
  })
  await listen<{ code: string; mode?: 'trend' | 'kline' | 'auction' }>('navigate_stock', (e) => {
    if (e.payload?.code) {
      navigateToStock(e.payload.code, e.payload.mode ?? 'trend')
    }
  })
  await listen<{ message: string }>('toast-message', (e) => {
    if (e.payload?.message) {
      showToast(e.payload.message)
    }
  })

  return null
}
