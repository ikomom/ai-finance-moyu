import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import type { SearchResult, WatchItem } from '../../types'

export interface WatchSearchBoxProps {
  items: WatchItem[]
  onAddWithItem: (item: WatchItem) => void
  onToast?: (msg: string, kind?: '' | 'ok' | 'bad') => void
}

export function WatchSearchBox(props: WatchSearchBoxProps) {
  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<SearchResult[]>([])
  const [isSearching, setIsSearching] = createSignal(false)
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)

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

    props.onAddWithItem({
      code: item.code,
      name: item.name,
      priceLines: [],
    })
    props.onToast?.(`已将「${item.name}」加入自选池`, 'ok')
    setQuery('')
    setResults([])
    setShowDropdown(false)
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
    </div>
  )
}
