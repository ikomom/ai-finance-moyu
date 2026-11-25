import { createComputed, onCleanup, type Accessor } from 'solid-js'

export type BackInterceptorCallback = () => boolean | void

interface InterceptorEntry {
  id: number
  onBack: BackInterceptorCallback
}

const entries: InterceptorEntry[] = []
let nextId = 1

/**
 * Register a back-navigation interceptor in LIFO order.
 * Returns an idempotent cleanup callback.
 */
export function registerBackInterceptor(onBack: BackInterceptorCallback): () => void {
  const id = nextId++
  entries.push({ id, onBack })
  let removed = false
  return () => {
    if (removed) return
    removed = true
    const idx = entries.findIndex((e) => e.id === id)
    if (idx !== -1) {
      entries.splice(idx, 1)
    }
  }
}

/**
 * Walk registered interceptors from newest (top) to oldest.
 * Returning `false` passes through to lower layers; `true` or `void` consumes.
 */
export function tryConsumeBack(): boolean {
  const snapshot = entries.slice()
  for (let i = snapshot.length - 1; i >= 0; i--) {
    const entry = snapshot[i]
    if (!entries.some((e) => e.id === entry.id)) continue
    const handled = entry.onBack()
    if (handled !== false) {
      return true
    }
  }
  return false
}

/** Whether any modal/drawer/drill-down interceptor is currently active. */
export function hasActiveBackInterceptor(): boolean {
  return entries.length > 0
}

/**
 * Reactively register a back interceptor while `active()` is truthy.
 * Preserves existing stack position if `active()` re-evaluates while still truthy.
 */
export function useBackInterceptor(
  active: Accessor<boolean>,
  onBack: BackInterceptorCallback
): void {
  let unregister: (() => void) | null = null

  createComputed(() => {
    const shouldBeActive = Boolean(active())
    if (shouldBeActive && !unregister) {
      unregister = registerBackInterceptor(onBack)
    } else if (!shouldBeActive && unregister) {
      unregister()
      unregister = null
    }
  })

  onCleanup(() => {
    unregister?.()
    unregister = null
  })
}

export function clearBackInterceptorsForTest(): void {
  entries.length = 0
}
