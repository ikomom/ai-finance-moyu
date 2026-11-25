import { ALL_GROUP_ID, DEFAULT_GROUP_ID, filterWatchlistByGroup } from './watchlistGroups'
import type { MiniViewMode, ViewState } from './viewHistory'
import type { Snapshot } from '../types'

export function buildViewState(
  s: Snapshot,
  selectedIdx: number,
  globalIdx: number,
  activeMiniMode: MiniViewMode
): ViewState {
  const layout = s.config.layout
  const activeGroupId = s.config.activeGroupId ?? ALL_GROUP_ID
  if (layout === 'global') {
    const indices = s.marketOverview?.globalIndices ?? []
    const clamped = Math.min(Math.max(0, globalIdx), Math.max(0, indices.length - 1))
    return { layout, code: indices[clamped]?.code }
  }
  if (layout === 'market') {
    return { layout }
  }
  const filtered = filterWatchlistByGroup(s.config.watchlist, activeGroupId)
  const currentCode = filtered[selectedIdx]?.code
  return layout === 'mini'
    ? { layout, code: currentCode, mode: activeMiniMode, groupId: activeGroupId }
    : { layout, code: currentCode, groupId: activeGroupId }
}

export interface ResolvedViewTarget {
  effectiveGroupId: string
  groupChanged: boolean
  nextSelected?: number
  nextGlobalIndex?: number
}

export function resolveViewTarget(s: Snapshot, target: ViewState): ResolvedViewTarget {
  const watchlist = s.config.watchlist
  const groups = s.config.groups ?? [{ id: DEFAULT_GROUP_ID, name: '默认自选' }]
  const currentGroupId = s.config.activeGroupId ?? ALL_GROUP_ID

  let effectiveGroupId = target.groupId ?? currentGroupId
  if (effectiveGroupId !== ALL_GROUP_ID && !groups.some((g) => g.id === effectiveGroupId)) {
    effectiveGroupId = ALL_GROUP_ID
  }
  if (target.layout === 'mini' && target.code) {
    const codeLower = target.code.toLowerCase()
    const inGroup = filterWatchlistByGroup(watchlist, effectiveGroupId).some(
      (w) => w.code.toLowerCase() === codeLower
    )
    if (!inGroup && watchlist.some((w) => w.code.toLowerCase() === codeLower)) {
      effectiveGroupId = ALL_GROUP_ID
    }
  }

  let nextGlobalIndex: number | undefined
  let nextSelected: number | undefined
  if (target.layout === 'global' && target.code) {
    const indices = s.marketOverview?.globalIndices ?? []
    const idx = indices.findIndex((g) => g.code.toLowerCase() === target.code!.toLowerCase())
    if (idx !== -1) nextGlobalIndex = idx
  } else if (target.code) {
    const filtered = filterWatchlistByGroup(watchlist, effectiveGroupId)
    const idx = filtered.findIndex((w) => w.code.toLowerCase() === target.code!.toLowerCase())
    if (idx !== -1) nextSelected = idx
  }

  return {
    effectiveGroupId,
    groupChanged: currentGroupId !== effectiveGroupId,
    nextSelected,
    nextGlobalIndex,
  }
}
