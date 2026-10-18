import { Show } from 'solid-js'
import type { SortCriterion } from './types'

export interface WatchToolbarProps {
  totalCount: number
  allExpanded: boolean
  onSort: (criterion: SortCriterion) => void
  onToggleAll: () => void
}

export function WatchToolbar(props: WatchToolbarProps) {
  return (
    <Show when={props.totalCount > 0}>
      <div class="watchlist-toolbar">
        <div class="toolbar-left">
          <Show when={props.totalCount > 1}>
            <span class="toolbar-label">快速排序：</span>
            <button
              type="button"
              class="sort-chip"
              title="有持仓股数的标的排在最前"
              onClick={() => props.onSort('holding')}
            >
              持仓优先
            </button>
            <button
              type="button"
              class="sort-chip"
              title="按标的名称汉字拼音升序排列"
              onClick={() => props.onSort('name')}
            >
              名称 A-Z
            </button>
            <button
              type="button"
              class="sort-chip"
              title="按标的代码升序排列"
              onClick={() => props.onSort('code-asc')}
            >
              代码 0-9
            </button>
            <button
              type="button"
              class="sort-chip"
              title="将现有顺序倒序反转"
              onClick={() => props.onSort('reverse')}
            >
              倒序
            </button>
          </Show>
          <button
            type="button"
            class="sort-chip"
            style="margin-left: 2px; color: #93c5fd; border-color: rgba(75, 142, 247, 0.35);"
            title="展开或收起全部自选卡片详细配置抽屉"
            onClick={() => props.onToggleAll()}
          >
            {props.allExpanded ? '全部收起 ▴' : '全部展开 ▾'}
          </button>
        </div>
        <span class="toolbar-tip">按住卡片左侧 ⋮⋮ 拖拽排序，点击「详情 ▾」设置持仓与指标</span>
      </div>
    </Show>
  )
}
