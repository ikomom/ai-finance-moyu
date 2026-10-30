import { invoke } from '@tauri-apps/api/core'
import type { Quote, WatchGroup, WatchItem } from '../types'

export const DEFAULT_GROUP_ID = 'default'
export const ALL_GROUP_ID = 'all'

export async function createWatchGroup(name: string): Promise<WatchGroup> {
  return invoke<WatchGroup>('create_watch_group', { name })
}

export async function renameWatchGroup(id: string, name: string): Promise<void> {
  await invoke('rename_watch_group', { id, name })
}

export async function deleteWatchGroup(id: string, moveToDefault: boolean): Promise<void> {
  await invoke('delete_watch_group', { id, moveToDefault })
}

export async function setActiveWatchGroup(id: string | null): Promise<void> {
  await invoke('set_active_watch_group', { id })
}

export async function moveWatchItem(code: string, targetGroup: string): Promise<void> {
  await invoke('move_watch_item', { code, targetGroup })
}

export async function pinWatchItem(code: string): Promise<void> {
  await invoke('pin_watch_item', { code })
}

export async function removeWatchItem(code: string): Promise<void> {
  await invoke('remove_watch_item', { code })
}

/**
 * Filter watchlist items by the active group ID.
 * If activeGroupId is 'all' or empty, returns all items.
 */
export function filterWatchlistByGroup(
  watchlist: WatchItem[] = [],
  activeGroupId?: string | null
): WatchItem[] {
  if (!activeGroupId || activeGroupId === ALL_GROUP_ID) {
    return watchlist
  }
  return watchlist.filter((item) => (item.group ?? DEFAULT_GROUP_ID) === activeGroupId)
}

/**
 * Filter quotes based on items in the active group.
 */
export function filterQuotesByGroup(
  quotes: Quote[] = [],
  watchlist: WatchItem[] = [],
  activeGroupId?: string | null
): Quote[] {
  if (!activeGroupId || activeGroupId === ALL_GROUP_ID) {
    return quotes
  }
  const filteredItems = filterWatchlistByGroup(watchlist, activeGroupId)
  const allowedCodes = new Set(filteredItems.map((item) => item.code))
  return quotes.filter((q) => allowedCodes.has(q.code))
}

/**
 * Compute stock counts for each group plus 'all'.
 */
export function computeGroupCounts(
  watchlist: WatchItem[] = [],
  groups: WatchGroup[] = []
): Record<string, number> {
  const counts: Record<string, number> = {
    [ALL_GROUP_ID]: watchlist.length,
  }
  for (const g of groups) {
    counts[g.id] = 0
  }
  for (const item of watchlist) {
    const gid = item.group ?? DEFAULT_GROUP_ID
    counts[gid] = (counts[gid] ?? 0) + 1
  }
  return counts
}
