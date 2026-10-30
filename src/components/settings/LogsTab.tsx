import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import type { LogEntry } from '../../types'
import { useSettings } from './SettingsContext'
import './LogsTab.css'

export function LogsTab() {
  const { say } = useSettings()

  const [recentLogs, setRecentLogs] = createSignal<LogEntry[]>([])
  const [logCategory, setLogCategory] = createSignal<string>('ALL')
  const [logSearch, setLogSearch] = createSignal<string>('')
  const [logLoading, setLogLoading] = createSignal(false)

  const fetchLogs = async () => {
    setLogLoading(true)
    try {
      const list = await invoke<LogEntry[]>('get_recent_logs')
      setRecentLogs(list)
    } catch (err) {
      console.error('获取运行日志失败:', err)
    } finally {
      setLogLoading(false)
    }
  }

  const handleClearLogs = async () => {
    try {
      await invoke('clear_memory_logs')
      setRecentLogs([])
      say('已清空内存日志记录', 'ok')
      window.setTimeout(() => say(''), 2000)
    } catch (e) {
      say(`清空日志失败: ${e}`, 'bad')
    }
  }

  const handleOpenLogDir = async () => {
    try {
      await invoke('open_log_dir')
      say('已在资源管理器中打开日志目录', 'ok')
      window.setTimeout(() => say(''), 2500)
    } catch (e) {
      say(`打开日志目录失败: ${e}`, 'bad')
    }
  }

  createEffect(() => {
    void fetchLogs()
    const timer = setInterval(() => {
      void fetchLogs()
    }, 3000)
    onCleanup(() => clearInterval(timer))
  })

  const filteredLogs = () => {
    const cat = logCategory()
    const search = logSearch().trim().toLowerCase()
    return recentLogs().filter((entry) => {
      if (cat === 'WARN_ERROR') {
        if (entry.level !== 'WARN' && entry.level !== 'ERROR') return false
      } else if (cat !== 'ALL') {
        if (entry.target !== cat) return false
      }
      if (search) {
        const matchMsg = entry.message.toLowerCase().includes(search)
        const matchTarget = entry.target.toLowerCase().includes(search)
        if (!matchMsg && !matchTarget) return false
      }
      return true
    })
  }

  return (
    <div class="tab-pane log-tab-pane">
      <div class="card log-card">
        <div class="card-title-row">
          <h2>运行日志与异动留痕</h2>
          <div class="log-actions">
            <button
              type="button"
              class="btn-sm btn-ghost"
              title="在 Windows 资源管理器中打开日志文件目录"
              onClick={() => void handleOpenLogDir()}
            >
              📁 打开日志目录
            </button>
            <button
              type="button"
              class="btn-sm btn-ghost"
              disabled={logLoading()}
              title="立即从后端拉取最新日志"
              onClick={() => void fetchLogs()}
            >
              {logLoading() ? '🔄 刷新中…' : '🔄 刷新'}
            </button>
            <button
              type="button"
              class="btn-sm btn-ghost btn-danger-ghost"
              title="清空当前内存中的日志缓冲区"
              onClick={() => void handleClearLogs()}
            >
              🗑️ 清空记录
            </button>
          </div>
        </div>
        <p class="hint">
          关键事件（盘中异动、集合竞价诊断、时段变迁、网络故障）均已持久化滚动留痕于本地 <code>%APPDATA%/.../logs/app.log</code>，自动轮转备份。
        </p>

        {/* Filter toolbar */}
        <div class="log-toolbar">
          <div class="log-categories">
            <For
              each={[
                { id: 'ALL', label: '全部' },
                { id: 'ALERT', label: '🚨 盘中异动' },
                { id: 'AUCTION', label: '⚖️ 集合竞价' },
                { id: 'SESSION', label: '🕒 时段变迁' },
                { id: 'TRADE', label: '💰 交易活动' },
                { id: 'AI', label: '🤖 AI决策' },
                { id: 'NET', label: '🌐 接口网络' },
                { id: 'SYSTEM', label: '⚙️ 系统配置' },
                { id: 'WARN_ERROR', label: '⚠️ 异常告警' },
              ]}
            >
              {(cat) => (
                <button
                  type="button"
                  class="log-filter-pill"
                  classList={{ active: logCategory() === cat.id }}
                  onClick={() => setLogCategory(cat.id)}
                >
                  {cat.label}
                </button>
              )}
            </For>
          </div>
          <div class="log-search-box">
            <input
              type="text"
              placeholder="搜索关键词..."
              value={logSearch()}
              onInput={(e) => setLogSearch(e.currentTarget.value)}
            />
            <Show when={logSearch().length > 0}>
              <button
                type="button"
                class="search-clear-btn"
                onClick={() => setLogSearch('')}
              >
                ×
              </button>
            </Show>
          </div>
        </div>

        {/* Log list container */}
        <div class="log-list-container">
          <Show
            when={filteredLogs().length > 0}
            fallback={
              <div class="log-empty-state">
                <span class="empty-icon">📝</span>
                <span>暂无匹配的运行日志记录</span>
              </div>
            }
          >
            <div class="log-list">
              <For each={filteredLogs()}>
                {(entry) => (
                  <div
                    class={`log-row level-${entry.level.toLowerCase()} target-${entry.target.toLowerCase()}`}
                  >
                    <span class="log-time">{entry.timestamp.split(' ')[1] || entry.timestamp}</span>
                    <span class={`log-badge-level level-${entry.level.toLowerCase()}`}>
                      {entry.level}
                    </span>
                    <span class={`log-badge-target target-${entry.target.toLowerCase()}`}>
                      {entry.target}
                    </span>
                    <span class="log-message" title={entry.message}>
                      {entry.message}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="log-footer-note">
          <span>💡 内存环形缓冲区保留最近 200 条，文件归档上限 5MB × 3 份。</span>
          <span>当前匹配: {filteredLogs().length} 条</span>
        </div>
      </div>
    </div>
  )
}
