import { For, Show } from 'solid-js'
import type { LlmProfile } from '../../types/agent'
import { ModelSwitcher } from '../agent/ModelSwitcher'

export interface StockQuoteBrief {
  name?: string
  price: number
  changePct: number
}

export interface CopilotHeaderProps {
  activeSymbol: string | null
  activeName: string | null
  watchlist: Array<{ code: string; name: string }>
  quotes: Record<string, StockQuoteBrief>
  onSelectSymbol: (symbol: string, name: string) => void
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onOpenSettings: () => void
  onClearSession: () => void
  /** Configured providers; unconfigured ones render disabled in the dropdown. */
  profiles: LlmProfile[]
  activeProfileId: string
  onSelectProfile: (profileId: string) => Promise<void>
}

function trendClass(pct: number): string {
  if (pct > 0) return 'up'
  if (pct < 0) return 'down'
  return 'flat'
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

export function CopilotHeader(props: CopilotHeaderProps) {
  return (
    <header class="copilot-header">
      {/* 左侧：侧栏切换与 Logo 标题 */}
      <div class="header-left">
        <button
          type="button"
          class="btn-toggle-sidebar"
          classList={{ active: props.isSidebarOpen }}
          onClick={props.onToggleSidebar}
          title={props.isSidebarOpen ? '收起历史侧栏' : '展开历史侧栏'}
        >
          ☰
        </button>
        <div class="brand-group">
          <span class="brand-icon">🤖</span>
          <div class="brand-title-wrap">
            <span class="brand-title">智投复盘</span>
            <span class="brand-badge">Financial Copilot</span>
          </div>
        </div>
      </div>

      {/* 中间：自选股横向水平胶囊选择栏 */}
      <div class="header-watchlist-scroll">
        <div class="watchlist-pills">
          <For each={props.watchlist}>
            {(w) => {
              const q = () => props.quotes[w.code]
              const isSelected = () => props.activeSymbol?.toLowerCase() === w.code.toLowerCase()

              return (
                <button
                  type="button"
                  class="stock-pill-btn"
                  classList={{
                    active: isSelected(),
                  }}
                  onClick={() => props.onSelectSymbol(w.code, w.name)}
                >
                  <span class="pill-name">{w.name}</span>
                  <Show when={q()}>
                    {(quote) => (
                      <span class={`pill-pct ${trendClass(quote().changePct)}`}>
                        {fmtPct(quote().changePct)}
                      </span>
                    )}
                  </Show>
                </button>
              )
            }}
          </For>
        </div>
      </div>

      {/* 右侧：模型切换、会话清空与设置跳转 */}
      <div class="header-right">
        <ModelSwitcher
          profiles={props.profiles}
          activeId={props.activeProfileId}
          onSelect={props.onSelectProfile}
        />
        <button
          type="button"
          class="btn-header-action"
          onClick={props.onClearSession}
          title="清空当前会话对话"
        >
          清空
        </button>
        <button
          type="button"
          class="btn-header-action accent"
          onClick={props.onOpenSettings}
          title="打开设置与长期记忆 (USER.md / MEMORY.md)"
        >
          ⚙️ 模型与记忆
        </button>
      </div>
    </header>
  )
}
