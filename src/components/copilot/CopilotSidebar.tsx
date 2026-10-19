import { createMemo, For, Show } from 'solid-js'
import type { ChatSessionSummary } from '../../types/agent'

export interface CopilotSidebarProps {
  sessions: ChatSessionSummary[]
  currentSessionId: string | null
  activeSymbol: string | null
  activeName: string | null
  filterCurrentOnly: boolean
  onToggleFilter: () => void
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string, e: MouseEvent) => void
  isOpen: boolean
  onClose?: () => void
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const date = d.getDate().toString().padStart(2, '0')
  const h = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${m}-${date} ${h}:${min}`
}

export function CopilotSidebar(props: CopilotSidebarProps) {
  const filteredSessions = createMemo(() => {
    if (!props.filterCurrentOnly || !props.activeSymbol) {
      return props.sessions
    }
    const targetSym = props.activeSymbol.toLowerCase()
    return props.sessions.filter(
      (s) => s.symbol && s.symbol.toLowerCase() === targetSym
    )
  })

  return (
    <aside
      class="copilot-sidebar"
      classList={{
        'sidebar-open': props.isOpen,
        'sidebar-collapsed': !props.isOpen,
      }}
    >
      {/* 顶部操作区: 新建复盘 + 标的筛选器 */}
      <div class="sidebar-header">
        <button
          type="button"
          class="btn-new-session"
          onClick={props.onNewSession}
          title="新建独立复盘会话"
        >
          <span class="btn-icon">＋</span>
          <span>新建复盘</span>
        </button>

        <div class="filter-row">
          <label class="filter-toggle-label" title="开启后仅显示当前所选标的历史">
            <input
              type="checkbox"
              class="filter-checkbox"
              checked={props.filterCurrentOnly}
              onChange={props.onToggleFilter}
            />
            <span class="filter-text">
              仅看当前标的
              <Show when={props.activeName}>
                <span class="filter-tag">({props.activeName})</span>
              </Show>
            </span>
          </label>
        </div>
      </div>

      {/* 历史会话卡片列表 */}
      <div class="sidebar-session-list">
        <Show
          when={filteredSessions().length > 0}
          fallback={
            <div class="sidebar-empty">
              <span>📭</span>
              <span>暂无复盘记录</span>
            </div>
          }
        >
          <For each={filteredSessions()}>
            {(s) => (
              <div
                class="session-card"
                classList={{ active: props.currentSessionId === s.id }}
                onClick={() => props.onSelectSession(s.id)}
              >
                <div class="session-card-header">
                  <Show when={s.symbol_name || s.symbol}>
                    <span class="session-symbol-chip">
                      {s.symbol_name ?? s.symbol}
                    </span>
                  </Show>
                  <span class="session-time">{fmtTime(s.updated_at)}</span>
                  <button
                    type="button"
                    class="btn-delete-session"
                    title="删除此会话"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onDeleteSession(s.id, e)
                    }}
                  >
                    ×
                  </button>
                </div>
                <div class="session-card-title" title={s.title}>
                  {s.title}
                </div>
                <div class="session-card-footer">
                  <span class="session-count">{s.message_count} 条推演</span>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </aside>
  )
}
