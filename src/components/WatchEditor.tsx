import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import './WatchEditor.css'
import type { PriceLine, SearchResult, StockIndicatorMode, WatchItem } from '../types'

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
  const [draggingIndex, setDraggingIndex] = createSignal<number | null>(null)
  const [dropTarget, setDropTarget] = createSignal<{ index: number; position: 'before' | 'after' } | null>(null)
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>({})

  const isDropBefore = (i: number) => {
    const dt = dropTarget()
    const dIdx = draggingIndex()
    if (!dt || dIdx === null || dIdx === i) return false
    if (dIdx < dt.index && dt.position === 'before' && dt.index - 1 === dIdx) return false
    if (dIdx > dt.index && dt.position === 'after' && dt.index + 1 === dIdx) return false
    return dt.index === i && dt.position === 'before'
  }

  const isDropAfter = (i: number) => {
    const dt = dropTarget()
    const dIdx = draggingIndex()
    if (!dt || dIdx === null || dIdx === i) return false
    if (dIdx < dt.index && dt.position === 'before' && dt.index - 1 === dIdx) return false
    if (dIdx > dt.index && dt.position === 'after' && dt.index + 1 === dIdx) return false
    return dt.index === i && dt.position === 'after'
  }

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

  const indicatorPresetBadge = (mode?: StockIndicatorMode | null) => {
    if (!mode || mode === 'inherit') return null
    if (mode === 'ultra_short') return '极速超短'
    if (mode === 'classic') return '经典短线'
    if (mode === 'swing') return '中线波段'
    if (mode === 'custom') return '自定义'
    return null
  }

  let searchBoxRef: HTMLDivElement | undefined
  let debounceTimer: number | undefined
  let scrollAnimFrame: number | null = null

  const stopAutoScroll = () => {
    if (scrollAnimFrame !== null) {
      cancelAnimationFrame(scrollAnimFrame)
      scrollAnimFrame = null
    }
  }

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
    stopAutoScroll()
  })

  const onHandlePointerDown = (e: PointerEvent, startIndex: number) => {
    if (e.button !== 0) return

    const startY = e.clientY
    let isDraggingActive = false
    let currentDropTarget: { index: number; position: 'before' | 'after' } | null = null

    const handleEl = e.currentTarget as HTMLElement
    const scrollContainer = handleEl.closest('.content-body') as HTMLElement | null
    const watchListEl = handleEl.closest('.watch-list') as HTMLElement | null

    const doAutoScroll = (clientY: number) => {
      if (!scrollContainer) return
      const rect = scrollContainer.getBoundingClientRect()
      const edgeThreshold = 45
      let speed = 0

      if (clientY < rect.top + edgeThreshold) {
        const intensity = Math.min(1, (rect.top + edgeThreshold - clientY) / edgeThreshold)
        speed = -Math.round(intensity * 12)
      } else if (clientY > rect.bottom - edgeThreshold) {
        const intensity = Math.min(1, (clientY - (rect.bottom - edgeThreshold)) / edgeThreshold)
        speed = Math.round(intensity * 12)
      }

      if (speed !== 0) {
        scrollContainer.scrollTop += speed
        updateDropTarget(clientY)
        scrollAnimFrame = requestAnimationFrame(() => doAutoScroll(clientY))
      } else {
        stopAutoScroll()
      }
    }

    const updateDropTarget = (clientY: number) => {
      if (!watchListEl) return
      const cards = Array.from(watchListEl.querySelectorAll<HTMLElement>('.watch'))
      if (cards.length === 0) return

      let foundTarget: { index: number; position: 'before' | 'after' } | null = null

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        const rect = card.getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom) {
          const midY = rect.top + rect.height / 2
          foundTarget = {
            index: i,
            position: clientY < midY ? 'before' : 'after',
          }
          break
        }
      }

      if (!foundTarget && cards.length > 0) {
        const firstRect = cards[0].getBoundingClientRect()
        const lastRect = cards[cards.length - 1].getBoundingClientRect()
        if (clientY < firstRect.top) {
          foundTarget = { index: 0, position: 'before' }
        } else if (clientY > lastRect.bottom) {
          foundTarget = { index: cards.length - 1, position: 'after' }
        }
      }

      currentDropTarget = foundTarget
      setDropTarget(foundTarget)
    }

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!isDraggingActive) {
        if (Math.abs(moveEv.clientY - startY) > 3) {
          isDraggingActive = true
          setDraggingIndex(startIndex)
          document.body.style.userSelect = 'none'
          document.body.style.cursor = 'grabbing'
        }
      }

      if (isDraggingActive) {
        updateDropTarget(moveEv.clientY)
        stopAutoScroll()
        doAutoScroll(moveEv.clientY)
      }
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      stopAutoScroll()
      document.body.style.userSelect = ''
      document.body.style.cursor = ''

      if (isDraggingActive && currentDropTarget) {
        const from = startIndex
        const target = currentDropTarget.index
        const pos = currentDropTarget.position

        let to = from
        if (from < target) {
          to = pos === 'before' ? target - 1 : target
        } else if (from > target) {
          to = pos === 'before' ? target : target + 1
        }

        if (to !== from && to >= 0 && to < props.items.length) {
          props.move(from, to)
          props.onToast?.('已调整自选股排序（点击底部保存生效）', 'ok')
        }
      }

      setDraggingIndex(null)
      setDropTarget(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

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

      {/* Quick Sort & Collapse Toolbar */}
      <Show when={props.items.length > 0}>
        <div class="watchlist-toolbar">
          <div class="toolbar-left">
            <Show when={props.items.length > 1}>
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
            </Show>
            <button
              type="button"
              class="sort-chip"
              style="margin-left: 2px; color: #93c5fd; border-color: rgba(75, 142, 247, 0.35);"
              title="展开或收起全部自选卡片详细配置抽屉"
              onClick={toggleAll}
            >
              {allExpanded() ? '全部收起 ▴' : '全部展开 ▾'}
            </button>
          </div>
          <span class="toolbar-tip">按住卡片左侧 ⋮⋮ 拖拽排序，点击「详情 ▾」设置持仓与指标</span>
        </div>
      </Show>

      {/* Watchlist Cards */}
      <div class="watch-list">
        <For each={props.items}>
          {(item, i) => (
            <div
              class="watch"
              classList={{
                'is-dragging': draggingIndex() === i(),
                'drop-before': isDropBefore(i()),
                'drop-after': isDropAfter(i()),
                'is-expanded': isExpanded(item.code, i()),
              }}
            >
              <div class="watch-head">
                <div
                  class="drag-handle"
                  title="按住上下拖拽排序"
                  onPointerDown={(e) => onHandlePointerDown(e, i())}
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

                <span class="num alert-num" title="个股涨跌提醒阈值（百分比）">
                  ±%
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="全局"
                    value={item.alertPct ?? ''}
                    onInput={(e) =>
                      props.update(i(), { alertPct: numOrNull(e.currentTarget.value) })
                    }
                  />
                </span>

                {/* Summary badges when collapsed */}
                <Show when={!isExpanded(item.code, i())}>
                  <div class="watch-summary-badges">
                    <Show when={item.costPrice != null || item.shares != null}>
                      <span class="summary-badge holding">
                        {item.costPrice != null ? `${item.costPrice}元` : ''}
                        {item.costPrice != null && item.shares != null ? ' · ' : ''}
                        {item.shares != null ? `${item.shares}股` : ''}
                      </span>
                    </Show>
                    <Show when={indicatorPresetBadge(item.indicatorMode)}>
                      <span class="summary-badge strategy">
                        {indicatorPresetBadge(item.indicatorMode)}
                      </span>
                    </Show>
                    <Show when={(item.priceLines?.length ?? 0) > 0}>
                      <span class="summary-badge lines">
                        {item.priceLines!.length}条预警
                      </span>
                    </Show>
                  </div>
                </Show>

                {/* Collapse / Expand Toggle Button */}
                <button
                  type="button"
                  class="collapse-toggle-btn"
                  classList={{ open: isExpanded(item.code, i()) }}
                  onClick={() => toggleExpand(item.code, i())}
                  title={isExpanded(item.code, i()) ? '收起配置抽屉' : '展开持仓、均线与价位线参数'}
                >
                  {isExpanded(item.code, i()) ? '收起 ▴' : '详情 ▾'}
                </button>

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

              {/* Collapsible Drawer Panel */}
              <Show when={isExpanded(item.code, i())}>
                <div class="watch-drawer">
                  {/* 1. 持仓与成本 */}
                  <div class="drawer-section">
                    <div class="drawer-section-title">持仓与成本</div>
                    <div class="drawer-row">
                      <span class="num">
                        成本价
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
                        持仓股数
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
                    </div>
                  </div>

                  {/* 2. 指标策略覆盖 */}
                  <div class="drawer-section">
                    <div class="drawer-section-title">指标策略覆盖 (MA均线与MACD)</div>
                    <div class="drawer-row">
                      <label class="drawer-label">策略档位：</label>
                      <select
                        class="indicator-select"
                        value={item.indicatorMode ?? 'inherit'}
                        onChange={(e) => {
                          const val = e.currentTarget.value as StockIndicatorMode
                          props.update(i(), { indicatorMode: val === 'inherit' ? null : val })
                        }}
                      >
                        <option value="inherit">跟随全局设置 (默认)</option>
                        <option value="ultra_short">极速超短 (MA 3/5/10 · MACD 6/13/5)</option>
                        <option value="classic">经典短线 (MA 5/10/20 · MACD 12/26/9)</option>
                        <option value="swing">中线波段 (MA 10/30/60 · MACD 19/39/9)</option>
                        <option value="custom">自定义参数</option>
                      </select>
                    </div>

                    <Show when={item.indicatorMode === 'custom'}>
                      <div class="custom-indicator-inputs">
                        <div class="quick-fill-row" style="margin-bottom: 6px;">
                          <span class="quick-fill-label">快捷填入档位：</span>
                          <button
                            type="button"
                            class="quick-fill-chip"
                            onClick={() => {
                              props.update(i(), {
                                customMa: [3, 5, 10],
                                customMacd: [6, 13, 5],
                              })
                              props.onToast?.('已填入「极速超短」参数', 'ok')
                            }}
                          >
                            ⚡ 极速超短 (3/5/10 · 6/13/5)
                          </button>
                          <button
                            type="button"
                            class="quick-fill-chip"
                            onClick={() => {
                              props.update(i(), {
                                customMa: [5, 10, 20],
                                customMacd: [12, 26, 9],
                              })
                              props.onToast?.('已填入「经典短线」参数', 'ok')
                            }}
                          >
                            🎯 经典短线 (5/10/20 · 12/26/9)
                          </button>
                          <button
                            type="button"
                            class="quick-fill-chip"
                            onClick={() => {
                              props.update(i(), {
                                customMa: [10, 30, 60],
                                customMacd: [19, 39, 9],
                              })
                              props.onToast?.('已填入「中线波段」参数', 'ok')
                            }}
                          >
                            🌊 中线波段 (10/30/60 · 19/39/9)
                          </button>
                        </div>
                        <div class="custom-group">
                          <span class="custom-title">MA 周期:</span>
                          <input
                            type="number"
                            min="1"
                            max="250"
                            value={item.customMa?.[0] ?? 5}
                            onInput={(e) => {
                              const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 5))
                              const ma = item.customMa ? [...item.customMa] : [5, 10, 20]
                              ma[0] = v
                              props.update(i(), { customMa: ma as [number, number, number] })
                            }}
                          />
                          <input
                            type="number"
                            min="1"
                            max="250"
                            value={item.customMa?.[1] ?? 10}
                            onInput={(e) => {
                              const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 10))
                              const ma = item.customMa ? [...item.customMa] : [5, 10, 20]
                              ma[1] = v
                              props.update(i(), { customMa: ma as [number, number, number] })
                            }}
                          />
                          <input
                            type="number"
                            min="1"
                            max="250"
                            value={item.customMa?.[2] ?? 20}
                            onInput={(e) => {
                              const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 20))
                              const ma = item.customMa ? [...item.customMa] : [5, 10, 20]
                              ma[2] = v
                              props.update(i(), { customMa: ma as [number, number, number] })
                            }}
                          />
                        </div>
                        <div class="custom-group">
                          <span class="custom-title">MACD (快/慢/信号):</span>
                          <input
                            type="number"
                            min="1"
                            max="250"
                            value={item.customMacd?.[0] ?? 12}
                            onInput={(e) => {
                              const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 12))
                              const macd = item.customMacd ? [...item.customMacd] : [12, 26, 9]
                              macd[0] = v
                              props.update(i(), { customMacd: macd as [number, number, number] })
                            }}
                          />
                          <input
                            type="number"
                            min="1"
                            max="250"
                            value={item.customMacd?.[1] ?? 26}
                            onInput={(e) => {
                              const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 26))
                              const macd = item.customMacd ? [...item.customMacd] : [12, 26, 9]
                              macd[1] = v
                              props.update(i(), { customMacd: macd as [number, number, number] })
                            }}
                          />
                          <input
                            type="number"
                            min="1"
                            max="250"
                            value={item.customMacd?.[2] ?? 9}
                            onInput={(e) => {
                              const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 9))
                              const macd = item.customMacd ? [...item.customMacd] : [12, 26, 9]
                              macd[2] = v
                              props.update(i(), { customMacd: macd as [number, number, number] })
                            }}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* 3. 价位线 */}
                  <div class="lines" style="margin-top: 0; padding-top: 0; border-top: none;">
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
              </Show>
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
