import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { DEFAULT_GROUP_ID, ALL_GROUP_ID } from '../../services/watchlistGroups'
import { showToast, snapshot } from '../../store'
import { SelectMenu } from '../SelectMenu'
import type { SearchResult, WatchItem } from '../../types'
import './QuickAddModal.css'

export interface QuickAddModalProps {
  onClose: () => void
}

export function QuickAddModal(props: QuickAddModalProps) {
  const s = () => snapshot()
  const groups = () => s()?.config.groups ?? [{ id: DEFAULT_GROUP_ID, name: '默认自选' }]
  const currentActive = () => s()?.config.activeGroupId

  const defaultGroup = () => {
    const aid = currentActive()
    if (!aid || aid === ALL_GROUP_ID) return DEFAULT_GROUP_ID
    return aid
  }

  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<SearchResult[]>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [selectedGroupId, setSelectedGroupId] = createSignal(defaultGroup())
  const [activeIndex, setActiveIndex] = createSignal(0)

  let inputRef: HTMLInputElement | undefined
  let debounceTimer: number | undefined

  onMount(() => {
    setTimeout(() => inputRef?.focus(), 50)
  })

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  const isAlreadyAdded = (code: string) => {
    const list = s()?.config.watchlist ?? []
    return list.some((item) => item.code.toLowerCase() === code.toLowerCase())
  }

  const handleSearch = (val: string) => {
    setQuery(val)
    if (debounceTimer) clearTimeout(debounceTimer)
    const trimmed = val.trim()
    if (!trimmed) {
      setResults([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    debounceTimer = window.setTimeout(async () => {
      try {
        const res = await invoke<SearchResult[]>('search_securities', { query: trimmed })
        setResults(res || [])
        setActiveIndex(0)
      } catch (e) {
        console.error('search_securities failed:', e)
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 200)
  }

  const handleAddStock = async (item: SearchResult) => {
    if (isAlreadyAdded(item.code)) {
      showToast(`「${item.name} (${item.code})」已在自选中`)
      return
    }

    const snap = s()
    if (!snap) return

    try {
      const newItem: WatchItem = {
        code: item.code,
        name: item.name,
        group: selectedGroupId(),
        priceLines: [],
      }

      const updatedWatchlist = [...snap.config.watchlist, newItem]
      const newCfg = { ...snap.config, watchlist: updatedWatchlist }
      await invoke('save_config', { cfg: newCfg })
      showToast(`已添加「${item.name}」到自选`)
      props.onClose()
    } catch (e) {
      console.error(e)
      showToast(`添加失败: ${e}`)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const list = results()
    if (e.key === 'Escape') {
      props.onClose()
      return
    }

    if (list.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev + 1) % list.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev - 1 + list.length) % list.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = list[activeIndex()]
      if (target) void handleAddStock(target)
    }
  }

  return (
    <div
      class="quick-add-backdrop"
      onClick={props.onClose}
      data-tauri-drag-region="none"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        class="quick-add-modal"
        onClick={(e) => e.stopPropagation()}
        data-tauri-drag-region="none"
      >
        <div class="quick-add-header">
          <span class="quick-add-title">🔍 搜索添加自选</span>
          <button type="button" class="quick-add-close" onClick={props.onClose}>
            ×
          </button>
        </div>

        <div class="quick-add-controls">
          <div class="quick-add-input-wrap">
            <input
              ref={inputRef}
              class="quick-add-input"
              placeholder="股票代码 / 拼音 / 名称..."
              value={query()}
              onInput={(e) => handleSearch(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <SelectMenu
            value={selectedGroupId()}
            options={groups().map((g) => ({ value: g.id, label: g.name }))}
            onChange={setSelectedGroupId}
            title="选择要加入的自选分组"
          />
        </div>

        <div class="quick-add-results">
          <Show
            when={results().length > 0}
            fallback={
              <div class="quick-add-empty">
                {isLoading() ? '搜索中…' : query().trim() ? '未找到相关标的' : '输入代码或拼音开始搜索'}
              </div>
            }
          >
            <For each={results()}>
              {(item, i) => {
                const added = () => isAlreadyAdded(item.code)
                return (
                  <div
                    class="quick-add-item"
                    classList={{ active: i() === activeIndex() }}
                    onClick={() => void handleAddStock(item)}
                  >
                    <div class="quick-add-item-left">
                      <span class="quick-add-item-name">{item.name}</span>
                      <span class="quick-add-item-code">{item.code}</span>
                    </div>
                    <div>
                      <Show
                        when={added()}
                        fallback={<span class="quick-add-item-badge">{item.category}</span>}
                      >
                        <span class="quick-add-item-badge added">已自选</span>
                      </Show>
                    </div>
                  </div>
                )
              }}
            </For>
          </Show>
        </div>

        <div class="quick-add-footer">
          <span>↑↓ 切换 · Enter 添加 · Esc 关闭</span>
        </div>
      </div>
    </div>
  )
}
