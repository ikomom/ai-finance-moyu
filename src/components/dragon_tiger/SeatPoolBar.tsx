import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { SeatWatchItem } from './SeatRadarView'
import { searchBranchDictionary, type BranchDictItem } from './seatDict'
import { cleanBranchName } from './utils'

export interface SeatPoolBarProps {
  seatPool: SeatWatchItem[]
  onToggleActive: (name: string) => void
  onRemoveSeat: (name: string) => void
  onAddSeat: (name: string, label?: string) => void
  onRestoreDefaults: () => void
}

export function SeatPoolBar(props: SeatPoolBarProps) {
  const [searchQuery, setSearchQuery] = createSignal('')
  const [isSuggestOpen, setIsSuggestOpen] = createSignal(false)

  const suggestions = () => {
    const q = searchQuery().trim()
    if (!q) return []
    return searchBranchDictionary(q).slice(0, 8)
  }

  const handleAdd = (name: string, label?: string) => {
    props.onAddSeat(name, label)
    setSearchQuery('')
    setIsSuggestOpen(false)
  }

  const handleWindowClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.seat-input-container')) {
      setIsSuggestOpen(false)
    }
  }

  onMount(() => {
    window.addEventListener('click', handleWindowClick)
  })
  onCleanup(() => {
    window.removeEventListener('click', handleWindowClick)
  })

  return (
    <div class="seat-radar-bar">
      <div class="seat-radar-title" style={{ "justify-content": "space-between" }}>
        <span>
          🎯 关注席位池 ({props.seatPool.filter((s) => s.active).length}/{props.seatPool.length} 生效)
        </span>
        <Show when={props.seatPool.length === 0}>
          <button
            type="button"
            class="seat-action-btn"
            style={{ "font-size": "9px", padding: "1px 6px" }}
            onClick={props.onRestoreDefaults}
          >
            恢复推荐游资
          </button>
        </Show>
      </div>

      {/* 关注席位池胶囊列表 */}
      <div class="seat-capsules-grid">
        <For each={props.seatPool}>
          {(seat) => (
            <span
              class={`seat-capsule-btn ${seat.active ? 'active' : ''}`}
              onClick={() => props.onToggleActive(seat.name)}
              title={`点击切换开启/关闭；点右侧 × 删除（${seat.name}）`}
            >
              <span>{seat.label || cleanBranchName(seat.name)}</span>
              <span
                class="seat-capsule-del"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onRemoveSeat(seat.name)
                }}
                title="从关注池中删除"
              >
                ×
              </span>
            </span>
          )}
        </For>
      </div>

      {/* 智能搜索与添加输入框 */}
      <div class="seat-input-container">
        <div class="seat-input-row">
          <input
            type="text"
            class="seat-custom-input"
            placeholder="搜索营业部或游资（如：六一、呼家、拉萨、江苏路…）"
            value={searchQuery()}
            onInput={(e) => {
              setSearchQuery(e.currentTarget.value)
              setIsSuggestOpen(e.currentTarget.value.trim().length > 0)
            }}
            onFocus={() => {
              if (searchQuery().trim().length > 0) setIsSuggestOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const s = suggestions()
                if (s.length > 0) {
                  handleAdd(s[0].branchName, s[0].traderLabel)
                } else if (searchQuery().trim()) {
                  handleAdd(searchQuery().trim())
                }
              } else if (e.key === 'Escape') {
                setIsSuggestOpen(false)
              }
            }}
          />
          <button
            type="button"
            class="seat-action-btn"
            onClick={() => {
              const s = suggestions()
              if (s.length > 0) {
                handleAdd(s[0].branchName, s[0].traderLabel)
              } else if (searchQuery().trim()) {
                handleAdd(searchQuery().trim())
              }
            }}
          >
            + 添加
          </button>
        </div>

        {/* 实时搜索下拉联想菜单 */}
        <Show when={isSuggestOpen() && searchQuery().trim().length > 0}>
          <div class="seat-suggest-menu">
            <For
              each={suggestions()}
              fallback={
                <div class="seat-suggest-empty">
                  <span>无预设收录，回车可直接添加为自定义营业部</span>
                </div>
              }
            >
              {(item: BranchDictItem) => (
                <div
                  class="seat-suggest-item"
                  onClick={() => handleAdd(item.branchName, item.traderLabel)}
                >
                  <div class="seat-suggest-info">
                    <Show when={item.traderLabel}>
                      <span class="seat-suggest-tag">{item.traderLabel}</span>
                    </Show>
                    <span class="seat-suggest-name">{item.branchName}</span>
                  </div>
                  <span class="seat-suggest-btn">+ 关注</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
