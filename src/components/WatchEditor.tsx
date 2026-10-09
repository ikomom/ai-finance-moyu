import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'

import type { PriceLine, SearchResult, WatchItem } from '../types'

export type SortCriterion = 'code-asc' | 'code-desc' | 'name' | 'holding' | 'reverse'

interface Props {
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

/**
 * Watchlist editor: quick search-and-add bar, code/name display, cost price,
 * per-security alert threshold, and price lines.
 */
export function WatchEditor(props: Props) {
  const [query, setQuery] = createSignal('')
  const [results, setResults] = createSignal<SearchResult[]>([])
  const [isSearching, setIsSearching] = createSignal(false)
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [highlightedIndex, setHighlightedIndex] = createSignal(0)
  const [draggedIdx, setDraggedIdx] = createSignal<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = createSignal<number | null>(null)

  let searchBoxRef: HTMLDivElement | undefined
  let debounceTimer: number | undefined

  const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v))

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

    props.addWithItem({
      code: item.code,
      name: item.name,
      priceLines: [],
    })
    props.onToast?.(`已将「${item.name}」加入自选池`, 'ok')
    setQuery('')
    setResults([])
    setShowDropdown(false)
  }

  const onSearchKeyDown = (e: KeyboardEvent) => {
    const list = results()
    if (!showDropdown() || list.length === 0) {
      if (e.key === 'Enter' && query().trim()) {
        // Trigger search immediately on Enter if dropdown not yet showing
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

  const resolveInlineCode = async (index: number, rawInput: string) => {
    const trimmed = rawInput.trim()
    if (!trimmed) return

    // If already normalized canonical code like sh600000 / sz000001
    const isPrefixed = /^(sh|sz|bj)\d{6}$/i.test(trimmed)
    if (isPrefixed) {
      const code = trimmed.toLowerCase()
      // If name missing, try looking it up
      if (!props.items[index]?.name) {
        try {
          const res = await invoke<SearchResult[]>('search_securities', { query: code })
          const match = res.find((r) => r.code.toLowerCase() === code)
          if (match) {
            props.update(index, { code, name: match.name })
            return
          }
        } catch (_) {}
      }
      props.update(index, { code })
      return
    }

    // Contains Chinese, pinyin, or bare digits
    try {
      const res = await invoke<SearchResult[]>('search_securities', { query: trimmed })
      if (res && res.length > 0) {
        const best = res[0]
        props.update(index, { code: best.code, name: best.name })
        props.onToast?.(`已智能识别为「${best.name} (${best.code})」`, 'ok')
      } else {
        props.onToast?.(`未找到匹配标的: ${trimmed}`, 'bad')
      }
    } catch (e) {
      props.onToast?.(`解析标的失败: ${e}`, 'bad')
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
    <div class="watch-editor-wrapper">
      {/* Quick Search & Add Bar */}
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

        {/* Suggestion Dropdown */}
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

      {/* Quick Sort Toolbar */}
      <Show when={props.items.length > 1}>
        <div class="watchlist-toolbar">
          <div class="toolbar-left">
            <span class="toolbar-label">快速排序：</span>
            <button
              type="button"
              class="sort-chip"
              title="有持仓股数的标的排在最前"
              onClick={() => props.sort('holding')}
            >
              持仓优先
            </button>
            <button
              type="button"
              class="sort-chip"
              title="按标的名称汉字拼音升序排列"
              onClick={() => props.sort('name')}
            >
              名称 A-Z
            </button>
            <button
              type="button"
              class="sort-chip"
              title="按标的代码升序排列"
              onClick={() => props.sort('code-asc')}
            >
              代码 0-9
            </button>
            <button
              type="button"
              class="sort-chip"
              title="将现有顺序倒序反转"
              onClick={() => props.sort('reverse')}
            >
              倒序
            </button>
          </div>
          <span class="toolbar-tip">按住卡片左侧 ⋮⋮ 拖拽，或用 ⤒ ▲ ▼ 精准调序</span>
        </div>
      </Show>

      {/* Watchlist Cards */}
      <div class="watch-list">
        <For each={props.items}>
          {(item, i) => (
            <div
              class="watch"
              classList={{
                'is-dragging': draggedIdx() === i(),
                'drag-over': dragOverIdx() === i(),
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (draggedIdx() !== null && draggedIdx() !== i()) {
                  setDragOverIdx(i())
                }
              }}
              onDragLeave={() => {
                if (dragOverIdx() === i()) setDragOverIdx(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const from = draggedIdx()
                const to = i()
                if (from !== null && from !== to) {
                  props.move(from, to)
                }
                setDraggedIdx(null)
                setDragOverIdx(null)
              }}
            >
              <div class="watch-head">
                <div
                  class="drag-handle"
                  draggable={true}
                  title="按住上下拖拽排序"
                  onDragStart={(e) => {
                    setDraggedIdx(i())
                    e.dataTransfer?.setData('text/plain', String(i()))
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setDraggedIdx(null)
                    setDragOverIdx(null)
                  }}
                >
                  ⋮⋮
                </div>

                <div class="code-and-name">
                  <Show when={item.name}>
                    <span class="stock-name-tag" title={item.name ?? ''}>
                      {item.name}
                    </span>
                  </Show>
                  <input
                    class="code"
                    type="text"
                    spellcheck={false}
                    placeholder="代码/中文/简拼"
                    value={item.code}
                    onInput={(e) => props.update(i(), { code: e.currentTarget.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        void resolveInlineCode(i(), e.currentTarget.value)
                      }
                    }}
                    onBlur={(e) => void resolveInlineCode(i(), e.currentTarget.value)}
                  />
                </div>

                <span class="num">
                  成本
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="元"
                    value={item.costPrice ?? ''}
                    onInput={(e) =>
                      props.update(i(), { costPrice: numOrNull(e.currentTarget.value) })
                    }
                  />
                </span>

                <span class="num">
                  持仓
                  <input
                    type="number"
                    step="100"
                    min="0"
                    placeholder="股"
                    value={item.shares ?? ''}
                    onInput={(e) =>
                      props.update(i(), { shares: numOrNull(e.currentTarget.value) })
                    }
                  />
                </span>

                <span class="num">
                  ±%
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={item.alertPct ?? ''}
                    onInput={(e) =>
                      props.update(i(), { alertPct: numOrNull(e.currentTarget.value) })
                    }
                  />
                </span>

                <div class="watch-actions">
                  <button
                    type="button"
                    class="icon-btn sort-btn"
                    title="置顶（移至第 1 位）"
                    disabled={i() === 0}
                    onClick={() => props.move(i(), 0)}
                  >
                    ⤒
                  </button>
                  <button
                    type="button"
                    class="icon-btn sort-btn"
                    title="上移一位"
                    disabled={i() === 0}
                    onClick={() => props.move(i(), i() - 1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    class="icon-btn sort-btn"
                    title="下移一位"
                    disabled={i() === props.items.length - 1}
                    onClick={() => props.move(i(), i() + 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    class="icon-btn del-btn"
                    title="删除这只股票"
                    onClick={() => props.remove(i())}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div class="lines">
                <div class="lines-head">
                  <span>价位线（到价时变色，可弹通知）</span>
                  <button type="button" class="ghost" onClick={() => props.addLine(i())}>
                    ＋ 加一条
                  </button>
                </div>
                <For each={item.priceLines ?? []}>
                  {(line, li) => (
                    <div class="line-row">
                      <input
                        class="price"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="价格"
                        value={line.price}
                        onInput={(e) =>
                          props.updateLine(i(), li(), { price: Number(e.currentTarget.value) })
                        }
                      />
                      <select
                        value={line.direction}
                        onChange={(e) =>
                          props.updateLine(i(), li(), {
                            direction: e.currentTarget.value as PriceLine['direction'],
                          })
                        }
                      >
                        <option value="above">上穿</option>
                        <option value="below">下穿</option>
                      </select>
                      <input
                        class="label"
                        type="text"
                        placeholder="备注（可选）"
                        value={line.label ?? ''}
                        onInput={(e) =>
                          props.updateLine(i(), li(), { label: e.currentTarget.value || null })
                        }
                      />
                      <button
                        type="button"
                        class="icon"
                        title="删除这条线"
                        onClick={() => props.removeLine(i(), li())}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </div>
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
