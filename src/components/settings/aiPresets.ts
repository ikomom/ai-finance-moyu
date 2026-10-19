import type { LlmProfile } from '../../types/agent'

export interface ProviderPreset {
  id: string
  name: string
  icon: string
  baseUrl: string
  defaultModel: string
  curatedModels: string[]
  searchSupported: boolean
  /** One line on what this provider is actually good at, shown under the picker. */
  note?: string
  /**
   * Rejects `temperature` / `top_p` outright (HTTP 400).
   *
   * The GPT-6 generation dropped the classic sampling parameters: sending one
   * is not ignored, it fails the request. The client strips them for these
   * models instead of letting every OpenAI call error out.
   */
  rejectsSamplingParams?: boolean
  /**
   * Headers the provider requires beyond `Authorization`.
   *
   * OpenCode Go rejects requests lacking `x-opencode-session` with a 401 that
   * reads exactly like a bad key.
   */
  requiredHeaders?: Array<[string, string]>
  /** Allows editing the endpoint away from the built-in one. */
  allowsCustomBaseUrl?: boolean
}

/**
 * Provider presets.
 *
 * Model ids were verified against each vendor's live documentation in Oct 2026.
 *
 * Two revisions got this wrong, which is why the date is in the comment:
 *  - DeepSeek disabled `deepseek-chat` / `deepseek-reasoner` on 2026-07-24
 *    (they survive briefly as aliases onto V4-Flash).
 *  - OpenAI retired `gpt-4o` and `gpt-4.1` on 2026-02-13; the current
 *    generation is GPT-6 (`gpt-6-astra`, `gpt-6.1-sol`, `gpt-6-luna`).
 *
 * A retired id still accepts requests for a while and bills them at whatever
 * model now sits behind it — so a stale preset silently changes both cost and
 * behaviour under code nobody touched. Only ids confirmed in vendor docs
 * belong here.
 */
export const AI_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🐬',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    curatedModels: ['deepseek-flash', 'deepseek-v4-pro'],
    searchSupported: false,
    note: 'V4 系列，支持 1M 上下文。性价比最高，盘面复盘首选。',
  },
  {
    id: 'opencode_go',
    name: 'OpenCode Go',
    icon: '🌿',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    defaultModel: 'deepseek-v4-flash',
    curatedModels: [
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'kimi-k2.6',
      'glm-5.1',
      'qwen3.7-plus',
      'minimax-m3',
    ],
    searchSupported: false,
    // Without this header the gateway answers 401 even with a valid key.
    requiredHeaders: [['x-opencode-session', 'ai-finance-moyu']],
    note: '订阅制模型聚合，一个 Key 覆盖 DeepSeek / Kimi / GLM / Qwen 等。需固定会话头。',
  },
  {
    id: 'dashscope',
    name: '阿里百炼',
    icon: '☁️',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3.7-plus',
    curatedModels: ['qwen3.7-plus', 'qwen3.8-max', 'qwen3.7-flash', 'qwen3-max'],
    searchSupported: true,
    note: 'Qwen3 系列，支持联网搜索与思考模式。',
  },
  {
    id: 'kimi',
    name: '月之暗面',
    icon: '🌙',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2.6',
    curatedModels: ['kimi-k2.6', 'kimi-k3', 'kimi-k2.7-code'],
    searchSupported: true,
    note: 'K2.6/K3，1M 上下文，长文本复盘与联网检索较强。',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🌐',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6-luna',
    curatedModels: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
    searchSupported: false,
    rejectsSamplingParams: true,
    note: 'GPT-6 系列。该系列已移除 temperature / top_p，客户端会自动剔除这些参数。',
  },
  {
    id: 'ollama',
    name: '本地Ollama',
    icon: '🦙',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen3.8:27b',
    curatedModels: ['qwen3.8:27b', 'qwen3.6:27b', 'gpt-oss:20b', 'qwen3:8b'],
    searchSupported: false,
    note: '完全离线，零数据外泄。需本地显存支撑，8B 起步。',
  },
  {
    id: 'custom',
    name: '自定义网关',
    icon: '🛠️',
    baseUrl: '',
    defaultModel: '',
    curatedModels: [],
    searchSupported: false,
    allowsCustomBaseUrl: true,
    note: '任何 OpenAI 兼容端点。模型标识需手动填写。',
  },
]

export const PRESET_BY_ID = new Map(AI_PRESETS.map((p) => [p.id, p]))

/** Build a fresh, unsaved profile for a preset. */
export function profileFromPreset(preset: ProviderPreset): LlmProfile {
  return {
    id: preset.id,
    label: preset.name,
    provider: preset.id,
    base_url: preset.baseUrl,
    api_key: '',
    model_name: preset.defaultModel,
    extra_headers: preset.requiredHeaders ? preset.requiredHeaders.map((h) => [...h] as [string, string]) : [],
  }
}
