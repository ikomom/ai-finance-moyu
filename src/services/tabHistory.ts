export interface LinearHistory<T> {
  push: (item: T) => void
  back: () => T | null
  forward: () => T | null
  current: () => T
}

/**
 * Generic bounded linear back/forward history (used e.g. for Settings sidebar tabs).
 * `push(item)` is idempotent when `item === current`, making it safe under reactive effects.
 */
export function createLinearHistory<T>(initial: T, maxSize = 20): LinearHistory<T> {
  const backStack: T[] = []
  const forwardStack: T[] = []
  let curr: T = initial

  return {
    push(item: T) {
      if (item === curr) return
      backStack.push(curr)
      if (backStack.length > maxSize) {
        backStack.shift()
      }
      forwardStack.length = 0
      curr = item
    },
    back() {
      if (backStack.length === 0) return null
      const prev = backStack.pop()!
      forwardStack.push(curr)
      if (forwardStack.length > maxSize) {
        forwardStack.shift()
      }
      curr = prev
      return prev
    },
    forward() {
      if (forwardStack.length === 0) return null
      const next = forwardStack.pop()!
      backStack.push(curr)
      if (backStack.length > maxSize) {
        backStack.shift()
      }
      curr = next
      return next
    },
    current() {
      return curr
    },
  }
}
