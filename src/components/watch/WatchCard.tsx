import { For, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { indicatorPresetBadge, numOrNull } from './types'
import { WatchDrawer } from './WatchDrawer'
import type { PriceLine, SearchResult, WatchGroup, WatchItem } from '../../types'

export interface WatchCardProps {
  item: WatchItem
  groups?: WatchGroup[]
  index: number
  totalCount: number
  isDragging: boolean
  isDropBefore: boolean
  isDropAfter: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onHandlePointerDown: (e: PointerEvent) => void
  onUpdate: (patch: Partial<WatchItem>) => void
  onMove: (toIndex: number) => void
  onRemove: () => void
  onAddLine: () => void
  onUpdateLine: (lineIndex: number, patch: Partial<PriceLine>) => void
  onRemoveLine: (lineIndex: number) => void
  onToast?: (msg: string, kind?: '' | 'ok' | 'bad') => void
}

export function WatchCard(props: WatchCardProps) {
  const resolveInlineCode = async (rawInput: string) => {
    const trimmed = rawInput.trim()
    if (!trimmed) return

    const isPrefixed = /^(sh|sz|bj)\d{6}$/i.test(trimmed)
    if (isPrefixed) {
      const code = trimmed.toLowerCase()
      if (!props.item.name) {
        try {
          const res = await invoke<SearchResult[]>('search_securities', { query: code })
          const match = res.find((r) => r.code.toLowerCase() === code)
          if (match) {
            props.onUpdate({ code, name: match.name })
            return
          }
        } catch (_) {}
      }
      props.onUpdate({ code })
      return
    }

    try {
      const res = await invoke<SearchResult[]>('search_securities', { query: trimmed })
      if (res && res.length > 0) {
        const best = res[0]
        props.onUpdate({ code: best.code, name: best.name })
        props.onToast?.(`已智能识别为「${best.name} (${best.code})」`, 'ok')
      } else {
        props.onToast?.(`未找到匹配标的: ${trimmed}`, 'bad')
      }
    } catch (e) {
      props.onToast?.(`解析标的失败: ${e}`, 'bad')
    }
  }

  return (
    <div
      class="watch"
      classList={{
        'is-dragging': props.isDragging,
        'drop-before': props.isDropBefore,
        'drop-after': props.isDropAfter,
        'is-expanded': props.isExpanded,
      }}
    >
      <div class="watch-head">
        <div
          class="drag-handle"
          title="按住上下拖拽排序"
          onPointerDown={props.onHandlePointerDown}
        >
          ⋮⋮
        </div>

        <div class="code-and-name">
          <Show when={props.item.name}>
            <span class="stock-name-tag" title={props.item.name ?? ''}>
              {props.item.name}
            </span>
          </Show>
          <input
            class="code"
            type="text"
            spellcheck={false}
            placeholder="代码/中文/简拼"
            value={props.item.code}
            onInput={(e) => props.onUpdate({ code: e.currentTarget.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void resolveInlineCode(e.currentTarget.value)
              }
            }}
            onBlur={(e) => void resolveInlineCode(e.currentTarget.value)}
          />
        </div>

        <span class="num alert-num" title="个股涨跌提醒阈值（百分比）">
          ±%
          <input
            type="number"
            step="0.5"
            min="0"
            placeholder="全局"
            value={props.item.alertPct ?? ''}
            onInput={(e) =>
              props.onUpdate({ alertPct: numOrNull(e.currentTarget.value) })
            }
          />
        </span>

        {/* Summary badges when collapsed */}
        <Show when={!props.isExpanded}>
          <div class="watch-summary-badges">
            <Show when={props.item.costPrice != null || props.item.shares != null}>
              <span class="summary-badge holding">
                {props.item.costPrice != null ? `${props.item.costPrice}元` : ''}
                {props.item.costPrice != null && props.item.shares != null ? ' · ' : ''}
                {props.item.shares != null ? `${props.item.shares}股` : ''}
              </span>
            </Show>
            <Show when={indicatorPresetBadge(props.item.indicatorMode)}>
              <span class="summary-badge strategy">
                {indicatorPresetBadge(props.item.indicatorMode)}
              </span>
            </Show>
            <Show when={(props.item.priceLines?.length ?? 0) > 0}>
              <span class="summary-badge lines">
                {props.item.priceLines!.length}条预警
              </span>
            </Show>
          </div>
        </Show>

        {/* Group selector tag */}
        <Show when={props.groups && props.groups.length > 1}>
          <select
            class="watch-group-select"
            value={props.item.group ?? 'default'}
            onChange={(e) => props.onUpdate({ group: e.currentTarget.value })}
            title="修改所属分组"
          >
            <For each={props.groups}>
              {(g) => <option value={g.id}>{g.name}</option>}
            </For>
          </select>
        </Show>

        {/* Collapse / Expand Toggle Button */}
        <button
          type="button"
          class="collapse-toggle-btn"
          classList={{ open: props.isExpanded }}
          onClick={props.onToggleExpand}
          title={props.isExpanded ? '收起配置抽屉' : '展开持仓、均线与价位线参数'}
        >
          {props.isExpanded ? '收起 ▴' : '详情 ▾'}
        </button>

        <div class="watch-actions">
          <button
            type="button"
            class="icon-btn sort-btn"
            title="置顶（移至第 1 位）"
            disabled={props.index === 0}
            onClick={() => props.onMove(0)}
          >
            ⤒
          </button>
          <button
            type="button"
            class="icon-btn sort-btn"
            title="上移一位"
            disabled={props.index === 0}
            onClick={() => props.onMove(props.index - 1)}
          >
            ▲
          </button>
          <button
            type="button"
            class="icon-btn sort-btn"
            title="下移一位"
            disabled={props.index === props.totalCount - 1}
            onClick={() => props.onMove(props.index + 1)}
          >
            ▼
          </button>
          <button
            type="button"
            class="icon-btn del-btn"
            title="删除这只股票"
            onClick={props.onRemove}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Collapsible Drawer Panel */}
      <Show when={props.isExpanded}>
        <WatchDrawer
          item={props.item}
          onUpdate={props.onUpdate}
          onAddLine={props.onAddLine}
          onUpdateLine={props.onUpdateLine}
          onRemoveLine={props.onRemoveLine}
          onToast={props.onToast}
        />
      </Show>
    </div>
  )
}
