import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { inTauri, logToBackend } from '../tauri'
import type {
  AgentHealthReport,
  AgentMessage,
  ChatSession,
  ChatSessionSummary,
  LlmConfig,
  MemoryManifest,
  MemoryMutation,
} from '../types/agent'
import { DEFAULT_LLM_CONFIG } from '../types/agent'

/**
 * Ask the backend to open the copilot window.
 *
 * Failures used to be swallowed (`void openCopilotWindow()` at every call site),
 * so a window that could not be created produced no message anywhere — just a
 * button that appeared dead. Report the reason instead of dropping it.
 */
export async function openCopilotWindow(symbol?: string): Promise<void> {
  if (!inTauri()) return
  try {
    await invoke('open_copilot_window', { symbol: symbol ?? null })
  } catch (err) {
    logToBackend(`打开复盘窗口失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function fetchChatSessions(): Promise<ChatSessionSummary[]> {
  if (!inTauri()) return []
  try {
    return await invoke<ChatSessionSummary[]>('get_chat_sessions')
  } catch (err) {
    console.error('Failed to load chat sessions:', err)
    return []
  }
}

export async function fetchChatSession(id: string): Promise<ChatSession | null> {
  if (!inTauri()) return null
  try {
    return await invoke<ChatSession>('get_chat_session', { id })
  } catch (err) {
    console.error(`Failed to load chat session ${id}:`, err)
    return null
  }
}

export async function saveChatSession(session: ChatSession): Promise<void> {
  if (!inTauri()) return
  await invoke('save_chat_session', { session })
}

export async function deleteChatSession(id: string): Promise<void> {
  if (!inTauri()) return
  await invoke('delete_chat_session', { id })
}

export async function clearChatSessions(): Promise<void> {
  if (!inTauri()) return
  await invoke('clear_chat_sessions')
}

export async function fetchAgentConfig(): Promise<LlmConfig> {
  if (!inTauri()) return DEFAULT_LLM_CONFIG
  try {
    return await invoke<LlmConfig>('get_agent_config')
  } catch (err) {
    console.error('Failed to load agent config:', err)
    return DEFAULT_LLM_CONFIG
  }
}

export async function saveAgentConfig(config: LlmConfig): Promise<void> {
  if (!inTauri()) return
  await invoke('save_agent_config', { config })
}

export async function fetchMemoryManifest(): Promise<MemoryManifest | null> {
  if (!inTauri()) {
    return {
      user_chars: 200,
      memory_chars: 150,
      user_limit: 1500,
      memory_limit: 2500,
      soul_md: '# Financial Copilot SOUL.md\n- 沉稳干练，严守纪律',
      user_md: '# User Profile (USER.md)\n- 风险偏好: 稳健短线',
      memory_md: '# Financial Memory (MEMORY.md)\n- 2024-08 北向红线',
    }
  }
  try {
    return await invoke<MemoryManifest>('get_memory_manifest')
  } catch (err) {
    console.error('Failed to load memory manifest:', err)
    return null
  }
}

export async function saveMemoryMutation(mutation: MemoryMutation): Promise<void> {
  if (!inTauri()) return
  await invoke('save_memory_mutation', { mutation })
}

export async function chatWithAgent(
  message: string,
  currentSymbol?: string,
  history: AgentMessage[] = []
): Promise<string> {
  if (!inTauri()) {
    return `### 🧭 【多空定调】\n- 标的: ${currentSymbol ?? '自选股'}\n- 浏览器预览模式下已生成模拟决策卡片。`
  }
  // The transcript is what makes this a conversation. It used to be dropped
  // on the floor here (`void history`), so every follow-up question reached
  // the model with no idea what "刚才那个" referred to.
  return await invoke<string>('chat_with_agent', {
    symbol: currentSymbol ?? '',
    prompt: message,
    message,
    history: history.map((m) => ({
      role: m.role,
      content: m.content,
      thought: m.thought ?? null,
    })),
  })
}

/**
 * Switch the active provider without opening the settings window.
 *
 * The backend refuses an id that is not configured or has no credential, and
 * the reason comes back as an error — surfaced verbatim so the user learns
 * *why* an entry was unavailable instead of seeing it silently do nothing.
 */
export async function setActiveProfile(profileId: string): Promise<LlmConfig> {
  return await invoke<LlmConfig>('set_active_profile', { profileId })
}

/**
 * Probe the configured provider with one real request.
 *
 * Deliberately not routed through `chatWithAgent`: that path falls back to the
 * local rule engine when no key is stored and still returns a string, which is
 * exactly how the settings pane came to show a green ✅ next to a red error.
 */
export async function checkAgentConnection(): Promise<AgentHealthReport | null> {
  if (!inTauri()) return null
  return await invoke<AgentHealthReport>('check_agent_connection')
}

export interface AgentStreamCallbacks {
  onChunk: (delta: string) => void
  onThought: (thoughtDelta: string) => void
  onDone: (fullContent: string, fullThought: string) => void
  onError: (error: string) => void
}

export async function listenToAgentStream(callbacks: AgentStreamCallbacks): Promise<UnlistenFn> {
  if (!inTauri()) {
    return () => {}
  }

  const unlistenChunk = await listen<any>('agent://chunk', (event) => {
    const delta = typeof event.payload === 'string' ? event.payload : (event.payload?.delta ?? '')
    if (delta) callbacks.onChunk(delta)
  })

  const unlistenThought = await listen<any>('agent://thought', (event) => {
    const thought = typeof event.payload === 'string' ? event.payload : (event.payload?.thought ?? '')
    if (thought) callbacks.onThought(thought)
  })

  const unlistenDone = await listen<any>('agent://done', (event) => {
    const content = typeof event.payload === 'object' && event.payload ? event.payload.content ?? '' : ''
    const thought = typeof event.payload === 'object' && event.payload ? event.payload.thought ?? '' : ''
    callbacks.onDone(content, thought)
  })

  const unlistenError = await listen<any>('agent://error', (event) => {
    const err = typeof event.payload === 'string' ? event.payload : (event.payload?.error ?? String(event.payload))
    callbacks.onError(err)
  })

  return () => {
    unlistenChunk()
    unlistenThought()
    unlistenDone()
    unlistenError()
  }
}
