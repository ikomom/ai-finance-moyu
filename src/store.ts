// Widget state.
//
// The backend replaces the whole snapshot on every poll, so a signal holding one
// immutable object is the right shape — Solid then updates only the DOM that
// actually depends on a changed field.

import { createSignal } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { demoSnapshot } from './demo'
import { inTauri } from './tauri'
import type { Layout, Snapshot } from './types'

const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null)
/** Which security the mini and list layouts detail. */
const [selected, setSelected] = createSignal(0)
/** Bumped when a threshold is crossed, so the card can flash. */
const [alertTick, setAlertTick] = createSignal(0)
/** Transient message shown at the bottom of the widget. */
const [toastMsg, setToastMsg] = createSignal<string | null>(null)

// Navigation history stack for layout transitions (e.g. List <-> Mini via mouse shoulder buttons)
const layoutBackStack: Layout[] = []
const layoutForwardStack: Layout[] = []
let lastRecordedLayout: Layout | null = null
let isNavigatingHistory = false

export function recordLayoutChange(newLayout: Layout): void {
  if (lastRecordedLayout === null) {
    lastRecordedLayout = newLayout
    return
  }
  if (lastRecordedLayout === newLayout) {
    return
  }
  if (isNavigatingHistory) {
    lastRecordedLayout = newLayout
    isNavigatingHistory = false
    return
  }
  layoutBackStack.push(lastRecordedLayout)
  if (layoutBackStack.length > 20) {
    layoutBackStack.shift()
  }
  layoutForwardStack.length = 0
  lastRecordedLayout = newLayout
}

export function navigateLayoutBack(): void {
  const current = snapshot()?.config.layout
  if (!current) return

  if (layoutBackStack.length > 0) {
    const prev = layoutBackStack.pop()!
    layoutForwardStack.push(current)
    if (layoutForwardStack.length > 20) {
      layoutForwardStack.shift()
    }
    isNavigatingHistory = true
    void invoke('set_layout', { layout: prev })
  } else if (current !== 'list') {
    // Fallback: If history stack is empty and current layout is not list, back defaults to list
    layoutForwardStack.push(current)
    if (layoutForwardStack.length > 20) {
      layoutForwardStack.shift()
    }
    isNavigatingHistory = true
    void invoke('set_layout', { layout: 'list' })
  }
}

export function navigateLayoutForward(): void {
  const current = snapshot()?.config.layout
  if (!current) return

  if (layoutForwardStack.length > 0) {
    const next = layoutForwardStack.pop()!
    layoutBackStack.push(current)
    if (layoutBackStack.length > 20) {
      layoutBackStack.shift()
    }
    isNavigatingHistory = true
    void invoke('set_layout', { layout: next })
  }
}

export { alertTick, selected, setSelected, setSnapshot, snapshot, toastMsg }

/** Show a message briefly, then clear it (unless a newer one replaced it). */
export function showToast(msg: string): void {
  setToastMsg(msg)
  window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600)
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
      showToast(first.message)
    }
  })

  return null
}
