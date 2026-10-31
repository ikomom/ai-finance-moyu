import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import type { SearchResult, WatchGroup, WatchItem } from '../../types'
import { DEFAULT_GROUP_ID } from '../../services/watchlistGroups'
import { SelectMenu } from '../SelectMenu'

export interface WatchSearchBoxProps {
  items: WatchItem[]
  groups?: WatchGroup[]
  activeGroupId?: string
  onAddWithItem: (item: WatchItem) => void
  onToast?: (msg: string, kind?: '' | 'ok' | 'bad') => void
}

export function WatchSearchBox(props: WatchSearchBoxProps) {
  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<SearchResult[]>([])
  const [isSearching, setIsSearching] = createSignal(false)
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)
  const [pendingTargetItem, setPendingTargetItem] = createSignal<SearchResult | null>(null)
  const [targetGroupId, setTargetGroupId] = createSignal(DEFAULT_GROUP_ID)

  let searchBoxRef: HTMLDivElement | undefined
  let debounceTimer: number | undefined

  const handleGlobalMouseDown = (e: MouseEvent) => {
    if (searchBoxRef && !searchBoxRef.contains(e.target as Node)) {
      setShowDropdown(false)
    }
  }

  onMount(() => {
    window.addEventListener('mousedown', handleGlobalMouseDown)
  })

  onCleanup(() => {
    window.removeEventListener('mousedown', handleGlobalMouseDown)
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  const onSearchInput = (val: string) => {
    setQuery(val)
    if (debounceTimer) clearTimeout(debounceTimer)
    const trimmed = val.trim()
    if (!trimmed) {
      setResults([])
      setShowDropdown(false)
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    debounceTimer = window.setTimeout(async () => {
      try {
        const res = await invoke<SearchResult[]>('search_securities', { query: trimmed })
        setResults(res || [])
        setHighlightedIndex(0)
        setShowDropdown(true)
      } catch (e) {
        console.error('Search securities failed:', e)
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 220)
  }

  const addFromSearch = (item: SearchResult) => {
    const exists = props.items.some((w) => w.code.toLowerCase() === item.code.toLowerCase())
    if (exists) {
      props.onToast?.(`「${item.name} (${item.code})」已在自选列表中`, 'bad')
      setShowDropdown(false)
      return
    }

    setShowDropdown(false)
    const initGid = props.activeGroupId && props.activeGroupId !== 'all' ? props.activeGroupId : DEFAULT_GROUP_ID
    setTargetGroupId(initGid)
    setPendingTargetItem(item)
  }

  const confirmAddWithGroup = () => {
    const item = pendingTargetItem()
    if (!item) return

    props.onAddWithItem({
      code: item.code,
      name: item.name,
      group: targetGroupId(),
      priceLines: [],
    })
    props.onToast?.(`已将「${item.name}」加入自选池`, 'ok')
    setQuery('')
    setResults([])
    setPendingTargetItem(null)
  }

  const triggerImmediateSearch = async () => {
    const trimmed = query().trim()
    if (!trimmed) return
    setIsSearching(true)
    try {
      const res = await invoke<SearchResult[]>('search_securities', { query: trimmed })
      if (res && res.length > 0) {
        addFromSearch(res[0])
      } else {
        props.onToast?.(`未找到与「${trimmed}」匹配的证券标的`, 'bad')
      }
    } catch (e) {
      props.onToast?.(`搜索失败：${e}`, 'bad')
    } finally {
      setIsSearching(false)
    }
  }

  const onSearchKeyDown = (e: KeyboardEvent) => {
    const list = results()
    if (!showDropdown() || list.length === 0) {
      if (e.key === 'Enter' && query().trim()) {
        void triggerImmediateSearch()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i + 1) % list.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i - 1 + list.length) % list.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = list[highlightedIndex()]
      if (selected) {
        addFromSearch(selected)
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  const categoryBadgeClass = (cat: string) => {
    switch (cat) {
      case '指数':
        return 'cat-index'
      case 'ETF':
        return 'cat-etf'
      case '北交':
        return 'cat-bj'
      default:
        return 'cat-ashare'
    }
  }

  return (
    <div class="search-add-bar-container" ref={searchBoxRef}>
      <div class="search-input-box">
        <span class="search-icon">🔍</span>
        <input
          type="text"
          class="search-input"
          spellcheck={false}
          placeholder="搜索股票 / 指数 / ETF（支持中文名称、拼音缩写或代码回车添加）"
          value={query()}
          onInput={(e) => onSearchInput(e.currentTarget.value)}
          onFocus={() => {
            if (results().length > 0 && query().trim()) setShowDropdown(true)
          }}
          onKeyDown={onSearchKeyDown}
        />
        <Show when={isSearching()}>
          <span class="search-spinner" title="搜索中...">⏳</span>
        </Show>
        <Show when={query().length > 0}>
          <button
            type="button"
            class="search-clear-btn"
            title="清空输入"
            onClick={() => {
              setQuery('')
              setResults([])
              setShowDropdown(false)
            }}
          >
            ✕
          </button>
        </Show>
      </div>

      <Show when={showDropdown() && results().length > 0}>
        <div class="search-dropdown-menu">
          <div class="dropdown-header">
            <span>匹配候选项（点击或按上下键+回车直接加入自选）</span>
            <span class="dropdown-count">{results().length} 条</span>
          </div>
          <div class="dropdown-list">
            <For each={results()}>
              {(item, idx) => {
                const isExisting = props.items.some(
                  (w) => w.code.toLowerCase() === item.code.toLowerCase()
                )
                return (
                  <div
                    class="dropdown-item"
                    classList={{
                      highlighted: idx() === highlightedIndex(),
                      existing: isExisting,
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx())}
                    onClick={() => addFromSearch(item)}
                  >
                    <span class={`cat-badge ${categoryBadgeClass(item.category)}`}>
                      {item.category}
                    </span>
                    <span class="item-name">{item.name}</span>
                    <span class="item-code">{item.code}</span>
                    <span class="item-pinyin">{item.pinyin}</span>
                    <Show when={isExisting}>
                      <span class="in-watchlist-tag">已在自选</span>
                    </Show>
                    <Show when={!isExisting}>
                      <span class="add-action-btn">＋ 加入</span>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Target group picker confirm modal */}
      <Show when={pendingTargetItem()}>
        <div class="group-modal-backdrop" onClick={() => setPendingTargetItem(null)}>
          <div class="group-modal" onClick={(e) => e.stopPropagation()}>
            <div class="group-modal-title">加入自选股票</div>
            <p style={{ 'font-size': '12px', color: '#e2e8f0', margin: '4px 0' }}>
              标的：<span style={{ color: '#38bdf8', 'font-weight': 600 }}>{pendingTargetItem()?.name}</span> ({pendingTargetItem()?.code})
            </p>
            <div style={{ 'margin-top': '6px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
              <span style={{ 'font-size': '11px', color: '#94a3b8' }}>选择归属分组：</span>
              <SelectMenu
                value={targetGroupId()}
                options={(props.groups ?? [{ id: DEFAULT_GROUP_ID, name: '默认自选' }]).map((g) => ({
                  value: g.id,
                  label: g.name,
                }))}
                onChange={setTargetGroupId}
                title="选择归属分组"
              />
            </div>
            <div class="group-modal-actions" style={{ 'margin-top': '10px' }}>
              <button
                type="button"
                class="group-modal-btn cancel"
                onClick={() => setPendingTargetItem(null)}
              >
                取消
              </button>
              <button
                type="button"
                class="group-modal-btn confirm"
                onClick={confirmAddWithGroup}
              >
                确认加入
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
