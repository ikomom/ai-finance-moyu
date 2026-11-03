import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import type { FocusSeatEntity } from './seatEntities'
import type { SeatCategory } from '../dragon_tiger/types'

export interface SeatEntityCardProps {
  entity: FocusSeatEntity
  onToggleEntity: (name: string) => void
  onDeleteEntity: (name: string) => void
  onAddBranch: (name: string, keyword: string) => void
  onDeleteBranch: (name: string, branchId: string) => void
  onChangeCategory: (name: string, category: SeatCategory) => void
}

const CATEGORY_NAMES: Record<SeatCategory, string> = {
  trader: '游资',
  institution: '机构',
  north: '外资',
  quant: '量化',
  retail: '散户',
  custom: '自定义',
}

const CATEGORY_LIST: { id: SeatCategory; label: string }[] = [
  { id: 'trader', label: '游资' },
  { id: 'institution', label: '机构' },
  { id: 'north', label: '外资' },
  { id: 'quant', label: '量化' },
  { id: 'retail', label: '散户' },
  { id: 'custom', label: '自定义' },
]

export function SeatEntityCard(props: SeatEntityCardProps) {
  const [isExpanded, setIsExpanded] = createSignal(false)
  const [newBranchInput, setNewBranchInput] = createSignal('')
  const [showCatMenu, setShowCatMenu] = createSignal(false)

  const handleAddBranch = () => {
    const kw = newBranchInput().trim()
    if (!kw) return
    props.onAddBranch(props.entity.name, kw)
    setNewBranchInput('')
  }

  const handleDeleteWithConfirm = (e: MouseEvent) => {
    e.stopPropagation()
    if (confirm(`确定将【${props.entity.name}】移出主力关注池吗？`)) {
      props.onDeleteEntity(props.entity.name)
    }
  }

  // 仅在下拉菜单展开期间按需注册全局点击外部监听器，避免常驻监听器泛滥
  createEffect(() => {
    if (!showCatMenu()) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.seat-category-selector')) {
        setShowCatMenu(false)
      }
    }
    window.addEventListener('click', handleClickOutside)
    onCleanup(() => {
      window.removeEventListener('click', handleClickOutside)
    })
  })

  // 预览显示的马甲（最多 2 个）
  const previewBranches = () => props.entity.branches.slice(0, 2)
  const extraBranchesCount = () => props.entity.branches.length - 2

  return (
    <div class={`seat-entity-card ${props.entity.enabled ? 'enabled' : 'disabled'}`}>
      {/* 紧凑的主行 */}
      <div class="seat-card-main-row" onClick={() => setIsExpanded(!isExpanded())}>
        <div class="seat-card-left">
          <span class="seat-card-name">{props.entity.name}</span>

          {/* 明确的分类选择下拉菜单 (不再隐晦) */}
          <div class="seat-category-selector" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              class={`seat-badge-pill ${props.entity.category} category-dropdown-btn`}
              onClick={() => setShowCatMenu(!showCatMenu())}
              title="点击切换分类属性"
            >
              <span>{CATEGORY_NAMES[props.entity.category] || props.entity.category}</span>
              <span class="seat-badge-arrow">▾</span>
            </button>

            <Show when={showCatMenu()}>
              <div class="seat-cat-dropdown-menu">
                <For each={CATEGORY_LIST}>
                  {(cat) => (
                    <div
                      class={`seat-cat-menu-item ${props.entity.category === cat.id ? 'selected' : ''}`}
                      onClick={() => {
                        props.onChangeCategory(props.entity.name, cat.id)
                        setShowCatMenu(false)
                      }}
                    >
                      <span class={`seat-badge-pill ${cat.id}`}>{cat.label}</span>
                      <Show when={props.entity.category === cat.id}>
                        <span class="seat-cat-check">✓</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* 营业部简述 / 预览 */}
          <div class="seat-branches-preview">
            <For each={previewBranches()}>
              {(branch) => <span class="seat-preview-chip">{branch.keyword}</span>}
            </For>
            <Show when={extraBranchesCount() > 0}>
              <span class="seat-preview-more">+{extraBranchesCount()}</span>
            </Show>
          </div>
        </div>

        <div class="seat-card-right" onClick={(e) => e.stopPropagation()}>
          {/* 状态开关 */}
          <button
            type="button"
            class={`seat-toggle-switch ${props.entity.enabled ? 'active' : ''}`}
            onClick={() => props.onToggleEntity(props.entity.name)}
            title={props.entity.enabled ? '点击暂停监控此席位' : '点击开启监控此席位'}
          >
            <span class="seat-switch-thumb" />
          </button>

          {/* 展开马甲折叠按钮 */}
          <button
            type="button"
            class="seat-expand-trigger-btn"
            onClick={() => setIsExpanded(!isExpanded())}
            title="展开/管理马甲营业部"
          >
            <span>马甲 ({props.entity.branches.length})</span>
            <span class="seat-chevron">{isExpanded() ? '▴' : '▾'}</span>
          </button>

          {/* 纯图标删除按钮 */}
          <button
            type="button"
            class="seat-card-del-btn"
            onClick={handleDeleteWithConfirm}
            title={`移出主力关注池 (${props.entity.name})`}
          >
            🗑️
          </button>
        </div>
      </div>

      {/* 展开的马甲营业部管理面板 */}
      <Show when={isExpanded()}>
        <div class="seat-expanded-branches-panel">
          <div class="seat-branches-panel-title">
            <span>关联营业部席位 ({props.entity.branches.length})</span>
            <span class="seat-branches-panel-hint">龙虎榜明细中出现以下任一营业部均会自动识别并高亮</span>
          </div>

          <div class="seat-branches-list">
            <For each={props.entity.branches}>
              {(branch) => (
                <span class="seat-branch-chip">
                  <span class="seat-chip-kw" title={branch.keyword}>
                    {branch.keyword}
                  </span>
                  <button
                    type="button"
                    class="seat-chip-remove"
                    onClick={() => props.onDeleteBranch(props.entity.name, branch.id)}
                    title="移除此马甲营业部"
                  >
                    ✕
                  </button>
                </span>
              )}
            </For>

            {/* 行内添加马甲 */}
            <div class="seat-inline-add-branch">
              <input
                type="text"
                class="seats-input seat-inline-input"
                placeholder="+ 关联新营业部…"
                value={newBranchInput()}
                onInput={(e) => setNewBranchInput(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddBranch()
                }}
              />
              <button
                type="button"
                class="seat-inline-confirm-btn"
                onClick={handleAddBranch}
                disabled={!newBranchInput().trim()}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
