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
import { buildViewState, resolveViewTarget } from './services/viewStateResolver'
import {
  navigateBack,
  navigateForward,
  recordExplicitJump,
  recordLayoutChange as recordHistoryLayoutChange,
  type ApplyStateOptions,
  type MiniViewMode,
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
const [selected, setSelected] = createSignal(0)
const [selectedGlobalIndex, setSelectedGlobalIndex] = createSignal(0)
const [alertTick, setAlertTick] = createSignal(0)
const [toastAlert, setToastAlert] = createSignal<ToastAlert | null>(null)
const toastMsg = () => toastAlert()?.message ?? null
const [newVersionAvailable, setNewVersionAvailable] = createSignal<string | null>(null)
const [miniModeOverride, setMiniModeOverride] = createSignal<MiniViewMode | null>(null)

let activeMiniMode: MiniViewMode = 'trend'

export function setActiveMiniMode(mode: MiniViewMode): void {
  activeMiniMode = mode
}

function getCurrentViewState(): ViewState | null {
  const s = snapshot()
  return s ? buildViewState(s, selectedIndex(), selectedGlobalIndex(), activeMiniMode) : null
}

function applyViewState(target: ViewState, opts?: ApplyStateOptions): void {
  const s = snapshot()
  if (!s) return

  const resolved = resolveViewTarget(s, target)
  const nextGroup = resolved.effectiveGroupId === ALL_GROUP_ID ? null : resolved.effectiveGroupId

  if (resolved.groupChanged) {
    void invoke('set_active_watch_group', { id: nextGroup }).catch(() => {})
  }
  if (resolved.nextGlobalIndex !== undefined) setSelectedGlobalIndex(resolved.nextGlobalIndex)
  if (resolved.nextSelected !== undefined) setSelected(resolved.nextSelected)

  if (target.layout === 'mini') {
    if (target.mode) {
      activeMiniMode = target.mode
      setMiniModeOverride(target.mode)
    }
  } else {
    setMiniModeOverride(null)
  }

  if (target.layout !== s.config.layout || opts?.layoutChanged) {
    void invoke('set_layout', { layout: target.layout })
  } else if (resolved.groupChanged) {
    setSnapshot((prev) => (prev ? { ...prev, config: { ...prev.config, activeGroupId: nextGroup } } : prev))
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

export function selectMiniStock(index: number): void {
  const s = snapshot()
  if (!s) return
  const activeGroupId = s.config.activeGroupId ?? ALL_GROUP_ID
  const target = filterWatchlistByGroup(s.config.watchlist, activeGroupId)[index]
  const currentState = getCurrentViewState()
  if (currentState && target) {
    recordExplicitJump(currentState, {
      layout: 'mini',
      code: target.code,
      mode: activeMiniMode,
      groupId: activeGroupId,
    })
  }
  setSelected(index)
}

export function selectGlobalIndex(index: number): void {
  const target = snapshot()?.marketOverview?.globalIndices?.[index]
  const currentState = getCurrentViewState()
  if (currentState && target) {
    recordExplicitJump(currentState, { layout: 'global', code: target.code })
  }
  setSelectedGlobalIndex(index)
}

export {
  alertTick,
  miniModeOverride,
  newVersionAvailable,
  selected,
  selectedGlobalIndex,
  setMiniModeOverride,
  setNewVersionAvailable,
  setSelected,
  setSelectedGlobalIndex,
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

/** Navigate to a specific stock in Mini layout, recording view history cleanly. */
export function navigateToStock(
  code: string,
  mode: MiniViewMode = 'trend',
  opts?: { fromLayout?: Layout; layoutApplied?: boolean }
): void {
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

  const needLayoutSwitch = s.config.layout !== 'mini'
  const currentState = getCurrentViewState()
  if (currentState) {
    recordExplicitJump(
      currentState,
      { layout: 'mini', code: targetItem.code, mode, groupId: effectiveGroupId },
      { expectLayoutSnapshot: needLayoutSwitch || opts?.layoutApplied, alreadySwitchedFrom: opts?.fromLayout }
    )
  }

  const idx = filterWatchlistByGroup(watchlist, effectiveGroupId).findIndex(
    (w) => w.code.toLowerCase() === code.toLowerCase()
  )
  if (idx !== -1) setSelected(idx)
  activeMiniMode = mode
  setMiniModeOverride(mode)

  if (needLayoutSwitch && !opts?.layoutApplied) {
    void invoke('set_layout', { layout: 'mini' })
  } else {
    setSnapshot((prev) =>
      prev ? { ...prev, config: { ...prev.config, activeGroupId: effectiveGroupId } } : prev
    )
    if (s.dock?.collapsed && !opts?.layoutApplied) {
      void invoke('set_dock_collapsed', { collapsed: false })
    }
  }
}

/** The selection, clamped to the active group's watchlist (falling back to quotes length). */
export function selectedIndex(): number {
  const s = snapshot()
  if (!s) return 0
  const activeGroupId = s.config.activeGroupId ?? ALL_GROUP_ID
  const filteredLen = filterWatchlistByGroup(s.config.watchlist, activeGroupId).length
  const n = filteredLen > 0 ? filteredLen : s.quotes.length
  return n === 0 ? 0 : Math.min(Math.max(selected(), 0), n - 1)
}

/** Load initial state and subscribe to updates. Resolves to an error message. */
export async function initStore(): Promise<string | null> {
  if (!inTauri()) {
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
    if (first?.message) showToast(first.message, first.code, first.name)
  })
  await listen<{
    code: string
    mode?: MiniViewMode
    fromLayout?: Layout
    layoutApplied?: boolean
  }>('navigate_stock', (e) => {
    if (e.payload?.code) {
      navigateToStock(e.payload.code, e.payload.mode ?? 'trend', {
        fromLayout: e.payload.fromLayout,
        layoutApplied: e.payload.layoutApplied,
      })
    }
  })
  await listen<{ message: string }>('toast-message', (e) => {
    if (e.payload?.message) showToast(e.payload.message)
  })

  return null
}
