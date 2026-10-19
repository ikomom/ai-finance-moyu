import { createSignal, onMount, onCleanup, Show } from 'solid-js'
import type { AgentMessage } from '../../types/agent'
import { chatWithAgent, listenToAgentStream } from '../../services/agent'
import { MessageList } from './MessageList'
import { CapsuleBar } from './CapsuleBar'
import { InputBox } from './InputBox'
import './AgentDrawer.css'

export interface AgentDrawerProps {
  isOpen: boolean
  onClose: () => void
  activeSymbol?: string
  activeName?: string
}

export function AgentDrawer(props: AgentDrawerProps) {
  const [messages, setMessages] = createSignal<AgentMessage[]>([])
  const [isStreaming, setIsStreaming] = createSignal(false)
  let unlistenStream: (() => void) | undefined

  onMount(async () => {
    unlistenStream = await listenToAgentStream({
      onChunk: (delta) => {
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const lastIdx = prev.length - 1
          const last = prev[lastIdx]
          if (last.role === 'assistant') {
            const updated = { ...last, content: last.content + delta }
            return [...prev.slice(0, lastIdx), updated]
          }
          return prev
        })
      },
      onThought: (thoughtDelta) => {
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const lastIdx = prev.length - 1
          const last = prev[lastIdx]
          if (last.role === 'assistant') {
            const updated = { ...last, thought: (last.thought || '') + thoughtDelta }
            return [...prev.slice(0, lastIdx), updated]
          }
          return prev
        })
      },
      onDone: (finalContent, finalThought) => {
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const lastIdx = prev.length - 1
          const last = prev[lastIdx]
          if (last.role === 'assistant') {
            const updated: AgentMessage = {
              ...last,
              content: finalContent || last.content,
              thought: finalThought || last.thought,
              isStreaming: false,
            }
            return [...prev.slice(0, lastIdx), updated]
          }
          return prev
        })
        setIsStreaming(false)
      },
      onError: (err) => {
        setMessages((prev) => {
          if (prev.length === 0) return prev
          const lastIdx = prev.length - 1
          const last = prev[lastIdx]
          if (last.role === 'assistant') {
            const updated: AgentMessage = {
              ...last,
              content: last.content + `\n\n> ⚠️ **推演中断**: ${err}`,
              isStreaming: false,
            }
            return [...prev.slice(0, lastIdx), updated]
          }
          return prev
        })
        setIsStreaming(false)
      },
    })
  })

  onCleanup(() => {
    if (unlistenStream) unlistenStream()
  })

  const handleSend = async (text: string) => {
    if (isStreaming()) return
    const userMsg: AgentMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
      symbol: props.activeSymbol,
    }

    const assistantMsg: AgentMessage = {
      id: `a_${Date.now()}`,
      role: 'assistant',
      content: '',
      thought: '',
      timestamp: Date.now(),
      isStreaming: true,
      symbol: props.activeSymbol,
    }

    const updatedHistory = [...messages(), userMsg]
    setMessages([...updatedHistory, assistantMsg])
    setIsStreaming(true)

    try {
      const directResponse = await chatWithAgent(text, props.activeSymbol, updatedHistory)
      if (directResponse) {
        setMessages((prev) => {
          const lastIdx = prev.length - 1
          const last = prev[lastIdx]
          if (last && last.role === 'assistant') {
            const updated: AgentMessage = {
              ...last,
              content: directResponse,
              isStreaming: false,
            }
            return [...prev.slice(0, lastIdx), updated]
          }
          return prev
        })
        setIsStreaming(false)
      }
    } catch (e: any) {
      setMessages((prev) => {
        const lastIdx = prev.length - 1
        const last = prev[lastIdx]
        if (last && last.role === 'assistant') {
          const updated: AgentMessage = {
            ...last,
            content: `### ⚠️ 推演异常\n\n${e?.message ?? e}`,
            isStreaming: false,
          }
          return [...prev.slice(0, lastIdx), updated]
        }
        return prev
      })
      setIsStreaming(false)
    }
  }

  const handleClear = () => {
    if (isStreaming()) return
    setMessages([])
  }

  return (
    <Show when={props.isOpen}>
      <aside class="agent-drawer">
        <header class="agent-drawer-header">
          <div class="agent-drawer-title-group">
            <span class="agent-logo">🤖</span>
            <span class="agent-drawer-title">智投副驾驶</span>
            <Show when={props.activeSymbol}>
              <span class="agent-active-badge">
                {props.activeName || props.activeSymbol}
              </span>
            </Show>
          </div>

          <div class="agent-drawer-header-actions">
            <button
              type="button"
              class="agent-header-btn"
              title="清空会话"
              onClick={handleClear}
              disabled={isStreaming()}
            >
              清空
            </button>
            <button
              type="button"
              class="agent-header-close"
              title="关闭副驾驶 (Esc)"
              onClick={props.onClose}
            >
              ✕
            </button>
          </div>
        </header>

        <main class="agent-drawer-body">
          <MessageList
            messages={messages()}
            activeSymbol={props.activeSymbol}
            activeName={props.activeName}
          />
        </main>

        <footer class="agent-drawer-footer">
          <CapsuleBar onSelect={handleSend} disabled={isStreaming()} />
          <InputBox onSend={handleSend} isStreaming={isStreaming()} />
        </footer>
      </aside>
    </Show>
  )
}
