//! Watchlist mutation helpers for the settings store.
//!
//! Extracted from `SettingsContext.tsx` so the provider keeps orchestration
//! only (AGENTS.md §11 colocation guidance).

import type { SetStoreFunction } from 'solid-js/store'
import type { Config, PriceLine, WatchItem } from '../../types'

export type SortCriterion = 'code-asc' | 'code-desc' | 'name' | 'holding' | 'reverse'

export function createWatchlistActions(
  setForm: SetStoreFunction<Config>,
  say: (text: string, kind?: '' | 'ok' | 'bad') => void
) {
  const updateItem = (i: number, patch: Partial<WatchItem>) => setForm('watchlist', i, patch)
  const addItem = () => setForm('watchlist', (list) => [...list, { code: '', priceLines: [] }])
  const addItemWith = (item: WatchItem) => setForm('watchlist', (list) => [...list, item])
  const removeItem = (i: number) => setForm('watchlist', (list) => list.filter((_, n) => n !== i))

  const moveItem = (from: number, to: number) => {
    // Bounds are checked against the live list inside the updater below, so the
    // out-of-range guard stays correct without binding the store here.
    if (from < 0 || to < 0 || from === to) return
    setForm('watchlist', (list) => {
      if (from >= list.length || to >= list.length) return list
      const next = [...list]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const sortItems = (criterion: 'code-asc' | 'code-desc' | 'name' | 'holding' | 'reverse') => {
    setForm('watchlist', (list) => {
      const next = [...list]
      if (criterion === 'code-asc') {
        next.sort((a, b) => a.code.localeCompare(b.code))
      } else if (criterion === 'code-desc') {
        next.sort((a, b) => b.code.localeCompare(a.code))
      } else if (criterion === 'name') {
        next.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'zh-Hans-CN'))
      } else if (criterion === 'holding') {
        next.sort((a, b) => ((b.shares || 0) > 0 ? 1 : 0) - ((a.shares || 0) > 0 ? 1 : 0))
      } else if (criterion === 'reverse') {
        next.reverse()
      }
      return next
    })
    say('已重新排序', 'ok')
    window.setTimeout(() => say(''), 1500)
  }

  const addLine = (i: number) =>
    setForm('watchlist', i, 'priceLines', (lines) => [
      ...(lines ?? []),
      { price: 0, direction: 'above' as const },
    ])

  const updateLine = (i: number, li: number, patch: Partial<PriceLine>) =>
    setForm('watchlist', i, 'priceLines', li, patch)

  const removeLine = (i: number, li: number) =>
    setForm('watchlist', i, 'priceLines', (lines) => (lines ?? []).filter((_, n) => n !== li))


  return {
    updateItem,
    addItem,
    addItemWith,
    removeItem,
    moveItem,
    sortItems,
    addLine,
    updateLine,
    removeLine,
  }
}
