import { createSignal, For, Show } from 'solid-js'
import './WatchEditor.css'
import {
  useWatchDragDrop,
  WatchCard,
  WatchSearchBox,
  WatchToolbar,
  type SortCriterion,
  type WatchEditorProps,
} from './watch'

export type { SortCriterion }

/**
 * Watchlist editor: quick search-and-add bar, sort toolbar,
 * sortable drag-and-drop cards, and detail drawer panels.
 */
export function WatchEditor(props: WatchEditorProps) {
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>({})

  const {
    draggingIndex,
    isDropBefore,
    isDropAfter,
    onHandlePointerDown,
  } = useWatchDragDrop()

  const isExpanded = (code: string, idx: number) => Boolean(expandedMap()[code || String(idx)])

  const toggleExpand = (code: string, idx: number) => {
    const key = code || String(idx)
    setExpandedMap((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const allExpanded = () =>
    props.items.length > 0 && props.items.every((it, idx) => isExpanded(it.code, idx))

  const toggleAll = () => {
    const shouldOpen = !allExpanded()
    const next: Record<string, boolean> = {}
    if (shouldOpen) {
      props.items.forEach((it, idx) => {
        next[it.code || String(idx)] = true
      })
    }
    setExpandedMap(next)
  }

  return (
    <div class="watch-editor-wrapper">
      {/* Quick Search & Add Bar */}
      <WatchSearchBox
        items={props.items}
        onAddWithItem={props.addWithItem}
        onToast={props.onToast}
      />

      {/* Quick Sort & Collapse Toolbar */}
      <WatchToolbar
        totalCount={props.items.length}
        allExpanded={allExpanded()}
        onSort={props.sort}
        onToggleAll={toggleAll}
      />

      {/* Watchlist Cards */}
      <div class="watch-list">
        <For each={props.items}>
          {(item, i) => (
            <WatchCard
              item={item}
              index={i()}
              totalCount={props.items.length}
              isDragging={draggingIndex() === i()}
              isDropBefore={isDropBefore(i())}
              isDropAfter={isDropAfter(i())}
              isExpanded={isExpanded(item.code, i())}
              onToggleExpand={() => toggleExpand(item.code, i())}
              onHandlePointerDown={(e) =>
                onHandlePointerDown(e, i(), props.items.length, props.move, props.onToast)
              }
              onUpdate={(patch) => props.update(i(), patch)}
              onMove={(to) => props.move(i(), to)}
              onRemove={() => props.remove(i())}
              onAddLine={() => props.addLine(i())}
              onUpdateLine={(li, patch) => props.updateLine(i(), li, patch)}
              onRemoveLine={(li) => props.removeLine(i(), li)}
              onToast={props.onToast}
            />
          )}
        </For>

        <Show when={props.items.length === 0}>
          <p class="muted">还没有自选股，请使用上方搜索栏或点下方「＋ 添加空白项」。</p>
        </Show>

        <div>
          <button type="button" class="ghost" onClick={() => props.add()}>
            ＋ 添加空白项
          </button>
        </div>
      </div>
    </div>
  )
}
