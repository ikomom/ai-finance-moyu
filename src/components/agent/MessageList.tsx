import { For, Show, createEffect } from 'solid-js'
import type { AgentMessage } from '../../types/agent'
import { FinancialCard } from './FinancialCard'
import { ThoughtAccordion } from './ThoughtAccordion'

export interface MessageListProps {
  messages: AgentMessage[]
  activeSymbol?: string
  activeName?: string
}

export function MessageList(props: MessageListProps) {
  let listContainerRef: HTMLDivElement | undefined

  createEffect(() => {
    // 监听消息数组变动，自动滚动至底部
    if (props.messages.length > 0 && listContainerRef) {
      listContainerRef.scrollTop = listContainerRef.scrollHeight
    }
  })

  return (
    <div class="agent-message-list" ref={listContainerRef}>
      <Show
        when={props.messages.length > 0}
        fallback={
          <div class="agent-empty-state">
            <div class="agent-empty-icon">🤖</div>
            <div class="agent-empty-title">A 股金融智投副驾驶</div>
            <div class="agent-empty-desc">
              锚定盘口 VWAP 多空分水岭，提供 4 象限确定性量化决策推演与逆人性风控纪律监督。
            </div>
            <div class="agent-empty-hint">
              当前聚焦：
              <span class="agent-focus-badge">
                {props.activeName ? `${props.activeName} (${props.activeSymbol})` : '自选行情'}
              </span>
            </div>
          </div>
        }
      >
        <For each={props.messages}>
          {(msg) => (
            <div class={`agent-message-row ${msg.role === 'user' ? 'agent-row-user' : 'agent-row-assistant'}`}>
              <div class="agent-message-bubble">
                <Show when={msg.role === 'assistant' && msg.thought}>
                  <ThoughtAccordion
                    thought={msg.thought || ''}
                    isStreaming={msg.isStreaming && !msg.content}
                  />
                </Show>

                <Show
                  when={msg.role === 'assistant'}
                  fallback={<div class="agent-user-text">{msg.content}</div>}
                >
                  <FinancialCard content={msg.content || (msg.isStreaming ? '正在生成量化推演...' : '')} />
                </Show>

                <Show when={msg.isStreaming && msg.role === 'assistant'}>
                  <span class="agent-typing-cursor" />
                </Show>
              </div>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}
