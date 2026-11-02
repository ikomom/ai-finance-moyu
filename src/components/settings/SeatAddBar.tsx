import { createSignal, For, Show } from 'solid-js'
import type { SeatCategory } from '../dragon_tiger/types'
import { searchSeatSuggestions, type SeatSuggestionItem } from './seatEntities'

export interface SeatAddBarProps {
  existingNames: string[]
  onAddEntity: (params: {
    name: string
    branchKeywords: string[]
    category: SeatCategory
  }) => void
  onSay: (msg: string) => void
}

export function SeatAddBar(props: SeatAddBarProps) {
  const [query, setQuery] = createSignal('')
  const [suggestions, setSuggestions] = createSignal<SeatSuggestionItem[]>([])
  const [showDropdown, setShowDropdown] = createSignal(false)

  const handleQueryChange = (val: string) => {
    setQuery(val)
    const trimmed = val.trim()
    if (!trimmed) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    const res = searchSeatSuggestions(trimmed, props.existingNames)
    setSuggestions(res)
    setShowDropdown(true)
  }

  const handleSelectSuggestion = (item: SeatSuggestionItem) => {
    props.onAddEntity({
      name: item.name,
      branchKeywords: item.branchKeywords,
      category: item.category,
    })
    setQuery('')
    setShowDropdown(false)
    props.onSay(`已关注【${item.name}】`)
  }

  const handleManualAdd = () => {
    const name = query().trim()
    if (!name) return

    if (props.existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      props.onSay(`【${name}】已在关注池中`)
      return
    }

    // 如果匹配到了建议项的第一条，直接选第一条
    const sug = suggestions()[0]
    if (sug && sug.name.toLowerCase() === name.toLowerCase()) {
      handleSelectSuggestion(sug)
      return
    }

    // 否则作为自定义游资加入
    props.onAddEntity({
      name,
      branchKeywords: [name],
      category: 'trader',
    })

    setQuery('')
    setShowDropdown(false)
    props.onSay(`已成功添加并关注【${name}】`)
  }

  return (
    <div class="seat-add-bar-container">
      <div class="seat-add-inputs-row">
        {/* 单一大搜索框 */}
        <div class="seat-add-input-wrapper">
          <input
            type="text"
            class="seats-input seat-query-input"
            placeholder="🔍 快速搜索或输入游资/营业部 (如: 作手新一, 呼家楼, zsxy, 南京太平南路…)"
            value={query()}
            onInput={(e) => handleQueryChange(e.currentTarget.value)}
            onFocus={() => {
              if (query().trim()) {
                const res = searchSeatSuggestions(query(), props.existingNames)
                setSuggestions(res)
                setShowDropdown(true)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleManualAdd()
              if (e.key === 'Escape') setShowDropdown(false)
            }}
          />

          {/* 下拉联想列表 */}
          <Show when={showDropdown() && (suggestions().length > 0 || query().trim().length > 0)}>
            <div class="seat-suggestions-dropdown">
              <For each={suggestions()}>
                {(item) => (
                  <div
                    class="seat-suggestion-item"
                    onClick={() => handleSelectSuggestion(item)}
                  >
                    <div class="seat-sug-left">
                      <span class={`seat-badge-pill ${item.category}`}>{item.name}</span>
                      <span class="seat-sug-desc">{item.sourceDesc}</span>
                    </div>
                    <span class="seat-sug-action">+ 关注</span>
                  </div>
                )}
              </For>

              {/* 若未完全匹配，提供自定义添加项 */}
              <Show when={query().trim() && !suggestions().some((s) => s.name === query().trim())}>
                <div class="seat-suggestion-item custom-create" onClick={handleManualAdd}>
                  <div class="seat-sug-left">
                    <span class="seat-badge-pill custom">自定义</span>
                    <span class="seat-sug-desc">将「{query().trim()}」作为新席位加入关注池</span>
                  </div>
                  <span class="seat-sug-action">+ 添加</span>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        {/* 添加按钮 */}
        <button
          type="button"
          class="seats-add-btn"
          onClick={handleManualAdd}
          disabled={!query().trim()}
        >
          + 关注
        </button>
      </div>
    </div>
  )
}
