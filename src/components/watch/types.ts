import type { PriceLine, StockIndicatorMode, WatchItem } from '../../types'

export type SortCriterion = 'code-asc' | 'code-desc' | 'name' | 'holding' | 'reverse'

export interface WatchEditorProps {
  items: WatchItem[]
  update: (index: number, patch: Partial<WatchItem>) => void
  add: () => void
  addWithItem: (item: WatchItem) => void
  remove: (index: number) => void
  move: (fromIndex: number, toIndex: number) => void
  sort: (criterion: SortCriterion) => void
  addLine: (index: number) => void
  updateLine: (index: number, lineIndex: number, patch: Partial<PriceLine>) => void
  removeLine: (index: number, lineIndex: number) => void
  onToast?: (msg: string, kind?: '' | 'ok' | 'bad') => void
}

export interface DropTarget {
  index: number
  position: 'before' | 'after'
}

export function indicatorPresetBadge(mode?: StockIndicatorMode | null): string | null {
  if (!mode || mode === 'inherit') return null
  if (mode === 'ultra_short') return '极速超短'
  if (mode === 'classic') return '经典短线'
  if (mode === 'swing') return '中线波段'
  if (mode === 'custom') return '自定义'
  return null
}

export function numOrNull(v: string): number | null {
  return v.trim() === '' ? null : Number(v)
}
