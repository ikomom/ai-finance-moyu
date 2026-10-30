import { createSignal, For, Show } from 'solid-js'
import './WatchEditor.css'
import {
  useWatchDragDrop,
  WatchCard,
  WatchGroupTabs,
  WatchSearchBox,
  WatchToolbar,
  type SortCriterion,
  type WatchEditorProps,
} from './watch'
import {
  ALL_GROUP_ID,
  computeGroupCounts,
  createWatchGroup,
  DEFAULT_GROUP_ID,
  deleteWatchGroup,
  renameWatchGroup,
} from '../services/watchlistGroups'

export type { SortCriterion }

/**
 * Watchlist editor: group tabs, quick search-and-add bar, sort toolbar,
 * sortable drag-and-drop cards, and detail drawer panels.
 */
export function WatchEditor(props: WatchEditorProps) {
  const [activeGroupId, setActiveGroupId] = createSignal<string>(ALL_GROUP_ID)
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>({})

  const groups = () => props.groups ?? [{ id: DEFAULT_GROUP_ID, name: '默认自选' }]
  const counts = () => computeGroupCounts(props.items, groups())

  const indexedItems = () =>
    props.items.map((item, originalIndex) => ({ item, originalIndex }))

  const filteredIndexedItems = () => {
    const aid = activeGroupId()
    if (aid === ALL_GROUP_ID) return indexedItems()
    return indexedItems().filter(({ item }) => (item.group ?? DEFAULT_GROUP_ID) === aid)
  }

  const handleCreateGroup = async (name: string) => {
    try {
      const g = props.onCreateGroup ? await props.onCreateGroup(name) : await createWatchGroup(name)
      props.onToast?.(`已创建分组「${name}」`, 'ok')
      setActiveGroupId(g.id)
    } catch (e) {
      props.onToast?.(String(e), 'bad')
    }
  }

  const handleRenameGroup = async (id: string, newName: string) => {
    try {
      if (props.onRenameGroup) {
        await props.onRenameGroup(id, newName)
      } else {
        await renameWatchGroup(id, newName)
      }
      props.onToast?.(`已将分组重命名为「${newName}」`, 'ok')
    } catch (e) {
      props.onToast?.(String(e), 'bad')
    }
  }

  const handleDeleteGroup = async (id: string, moveToDefault: boolean) => {
    try {
      if (props.onDeleteGroup) {
        await props.onDeleteGroup(id, moveToDefault)
      } else {
        await deleteWatchGroup(id, moveToDefault)
      }
      props.onToast?.(`已删除分组`, 'ok')
      setActiveGroupId(ALL_GROUP_ID)
    } catch (e) {
      props.onToast?.(String(e), 'bad')
    }
  }

  const {
    draggingIndex,
    isDropBefore,
    isDropAfter,
    onHandlePointerDown,
  } = useWatchDragDrop()

  const handleLocalMove = (fromLocal: number, toLocal: number) => {
    const list = filteredIndexedItems()
    if (fromLocal < 0 || fromLocal >= list.length || toLocal < 0 || toLocal >= list.length) return
    const fromGlobal = list[fromLocal].originalIndex
    const toGlobal = list[toLocal].originalIndex
    props.move(fromGlobal, toGlobal)
  }

  const isExpanded = (code: string, idx: number) => Boolean(expandedMap()[code || String(idx)])

  const toggleExpand = (code: string, idx: number) => {
    const key = code || String(idx)
    setExpandedMap((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const allExpanded = () => {
    const currentList = filteredIndexedItems()
    return currentList.length > 0 && currentList.every(({ item, originalIndex }) => isExpanded(item.code, originalIndex))
  }

  const toggleAll = () => {
    const shouldOpen = !allExpanded()
    const next: Record<string, boolean> = { ...expandedMap() }
    filteredIndexedItems().forEach(({ item, originalIndex }) => {
      next[item.code || String(originalIndex)] = shouldOpen
    })
    setExpandedMap(next)
  }

  return (
    <div class="watch-editor-wrapper">
      {/* 1. Watchlist Groups Tabs */}
      <WatchGroupTabs
        groups={groups()}
        activeGroupId={activeGroupId()}
        counts={counts()}
        onSelectGroup={setActiveGroupId}
        onCreateGroup={handleCreateGroup}
        onRenameGroup={handleRenameGroup}
        onDeleteGroup={handleDeleteGroup}
      />

      {/* 2. Quick Search & Add Bar */}
      <WatchSearchBox
        items={props.items}
        groups={groups()}
        activeGroupId={activeGroupId()}
        onAddWithItem={props.addWithItem}
        onToast={props.onToast}
      />

      {/* 3. Quick Sort & Collapse Toolbar */}
      <WatchToolbar
        totalCount={filteredIndexedItems().length}
        allExpanded={allExpanded()}
        onSort={props.sort}
        onToggleAll={toggleAll}
      />

      {/* 4. Watchlist Cards */}
      <div class="watch-list">
        <For each={filteredIndexedItems()}>
          {({ item, originalIndex }, localIndex) => (
            <WatchCard
              item={item}
              groups={groups()}
              index={localIndex()}
              totalCount={filteredIndexedItems().length}
              isDragging={draggingIndex() === localIndex()}
              isDropBefore={isDropBefore(localIndex())}
              isDropAfter={isDropAfter(localIndex())}
              isExpanded={isExpanded(item.code, originalIndex)}
              onToggleExpand={() => toggleExpand(item.code, originalIndex)}
              onHandlePointerDown={(e) =>
                onHandlePointerDown(
                  e,
                  localIndex(),
                  filteredIndexedItems().length,
                  handleLocalMove,
                  props.onToast
                )
              }
              onUpdate={(patch) => props.update(originalIndex, patch)}
              onMove={(toLocal) => handleLocalMove(localIndex(), toLocal)}
              onRemove={() => props.remove(originalIndex)}
              onAddLine={() => props.addLine(originalIndex)}
              onUpdateLine={(li, patch) => props.updateLine(originalIndex, li, patch)}
              onRemoveLine={(li) => props.removeLine(originalIndex, li)}
              onToast={props.onToast}
            />
          )}
        </For>

        <Show when={filteredIndexedItems().length === 0}>
          <p class="muted">当前分组暂无自选股，请使用上方搜索栏或点下方「＋ 添加空白项」。</p>
        </Show>

        <div>
          <button
            type="button"
            class="ghost"
            onClick={() => {
              const gid = activeGroupId() === ALL_GROUP_ID ? DEFAULT_GROUP_ID : activeGroupId()
              props.addWithItem({
                code: '',
                group: gid,
                priceLines: [],
              })
            }}
          >
            ＋ 添加空白项
          </button>
        </div>
      </div>
    </div>
  )
}
