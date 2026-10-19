export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thought?: string
  isStreaming?: boolean
  timestamp: number
  symbol?: string
}

/**
 * One configured provider: its own endpoint, credential and model.
 *
 * Every profile is self-contained on purpose. Switching models in the copilot
 * switches the whole chain — you cannot send a `kimi-k2.6` id to a DeepSeek key.
 */
export interface LlmProfile {
  id: string
  label: string
  /** Preset id, or `custom` for a hand-entered endpoint. */
  provider: string
  base_url: string
  /** Never returned by the backend; use `hasApiKey` to know if one is stored. */
  api_key: string
  model_name: string
  /**
   * Provider-mandated headers, as `[name, value]` pairs.
   *
   * OpenCode Go answers 401 without `x-opencode-session`, so this is part of the
   * protocol rather than decoration.
   */
  extra_headers?: Array<[string, string]>
  hasApiKey?: boolean
}

/**
 * Wire shape of the LLM provider config.
 *
 * Field names are snake_case on purpose: they mirror the Rust struct in
 * `src-tauri/src/agent/config.rs` verbatim. Renaming either side silently
 * breaks every save, which is exactly what happened before.
 */
export interface LlmConfig {
  profiles: LlmProfile[]
  active_profile_id: string
  enable_search: boolean
  temperature: number
  max_tokens: number
  /** True when the active profile already holds a stored credential. */
  has_api_key?: boolean
}

/**
 * Result of the provider probe. `reachable` is the only field that may drive a
 * success badge — it is true only when the provider actually answered a real
 * request. The old check reported success whenever a string came back, which
 * the local rule engine happily provided with no key configured at all.
 */
export interface AgentHealthReport {
  status:
    | 'ok'
    | 'no_key'
    | 'auth_failed'
    | 'rate_limited'
    | 'insufficient_balance'
    | 'model_unavailable'
    | 'network'
    | 'server_error'
    | 'bad_response'
  reachable: boolean
  latencyMs: number
  model: string
  baseUrl: string
  hasKey: boolean
  reply: string
  detail: string
}

/** Sentinel the backend understands as "delete the stored key". */
export const CLEAR_API_KEY_SENTINEL = '__CLEAR__'

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  profiles: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      provider: 'deepseek',
      base_url: 'https://api.deepseek.com',
      api_key: '',
      model_name: 'deepseek-flash',
      extra_headers: [],
    },
  ],
  active_profile_id: 'deepseek',
  enable_search: false,
  temperature: 0.6,
  max_tokens: 4096,
  has_api_key: false,
}

export interface MemoryManifest {
  user_chars: number
  memory_chars: number
  user_limit: number
  memory_limit: number
  soul_md: string
  user_md: string
  memory_md: string
}

export interface MemoryMutation {
  target: 'SOUL' | 'USER' | 'MEMORY' | 'USER.md' | 'MEMORY.md'
  action: 'ADD' | 'APPEND' | 'UPDATE' | 'DELETE' | 'REPLACE_ALL'
  section?: string
  new_text?: string
  old_text?: string
}

export interface ChatSessionSummary {
  id: string
  title: string
  symbol?: string
  symbol_name?: string
  updated_at: number
  message_count: number
}

export interface ChatSession {
  id: string
  title: string
  symbol?: string
  symbol_name?: string
  created_at: number
  updated_at: number
  messages: AgentMessage[]
}
