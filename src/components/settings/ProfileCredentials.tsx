import { createSignal, For, Show } from 'solid-js'
import type { AgentHealthReport, LlmProfile } from '../../types/agent'
import { CLEAR_API_KEY_SENTINEL } from '../../types/agent'
import { checkAgentConnection } from '../../services/agent'
import { Badge, Button, Card, Input } from '../ui'

/** Mirrors `PROBE_MAX_TOKENS` in `src-tauri/src/agent/health.rs`. */
const PROBE_TOKENS = 32

export interface ProfileCredentialsProps {
  profile: LlmProfile
  /** Whole config, needed because saving is not per-profile. */
  onPatch: (patch: Partial<LlmProfile>) => void
  onSaveConfig: () => Promise<void>
}

/**
 * Endpoint + credential editor, plus a connection probe.
 *
 * Extracted from `AiSettingsTab` to keep that file inside the 300-line budget
 * (AGENTS.md §11). The probe lives here rather than at the tab level because it
 * tests *this* profile, not "the AI subsystem".
 */
export function ProfileCredentials(props: ProfileCredentialsProps) {
  const [showKey, setShowKey] = createSignal(false)
  const [testStatus, setTestStatus] = createSignal<'idle' | 'testing' | 'done' | 'failed'>('idle')
  const [health, setHealth] = createSignal<AgentHealthReport | null>(null)
  const [testError, setTestError] = createSignal('')

  const pasteKey = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) props.onPatch({ api_key: text.trim() })
    } catch {
      // Clipboard permission denied — the user can still type it.
    }
  }

  const clearKey = async () => {
    props.onPatch({ api_key: CLEAR_API_KEY_SENTINEL })
    try {
      await props.onSaveConfig()
    } finally {
      // Either way the field must stop showing the sentinel: the backend does
      // not accept it, and `onSaveConfig` reports its own error upstream.
      props.onPatch({ api_key: '' })
    }
  }

  const runProbe = async () => {
    setTestStatus('testing')
    setHealth(null)
    setTestError('')
    try {
      // Persist first so the probe reads exactly what is on screen.
      await props.onSaveConfig()
      setHealth(await checkAgentConnection())
      setTestStatus('done')
    } catch (err) {
      setTestStatus('failed')
      setTestError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Card title="接口凭据" icon="🔑" subtitle={`配置 ${props.profile.label} 的密钥与端点`}>
        <div class="flex flex-col gap-2.5">
          <div>
            <label class="block text-[11px] text-slate-400 mb-1">服务商名称</label>
            <Input
              value={props.profile.label}
              onInput={(v) => props.onPatch({ label: v })}
              placeholder="例如 OpenCode Go"
            />
          </div>

          <div>
            <label class="block text-[11px] text-slate-400 mb-1">接口地址 (Base URL)</label>
            <Input
              value={props.profile.base_url}
              onInput={(v) => props.onPatch({ base_url: v })}
              placeholder="https://api.deepseek.com"
            />
          </div>

          <div>
            <label class="block text-[11px] text-slate-400 mb-1">API Key 密钥</label>
            <Input
              type={showKey() ? 'text' : 'password'}
              value={props.profile.api_key}
              onInput={(v) => props.onPatch({ api_key: v })}
              placeholder={props.profile.hasApiKey ? '已保存（留空表示不修改）' : 'sk-...'}
              suffix={
                <div class="flex items-center gap-1">
                  <Button variant="ghost" size="xs" onClick={() => setShowKey(!showKey())}>
                    {showKey() ? '🙈 隐藏' : '👁️ 显示'}
                  </Button>
                  <Button variant="ghost" size="xs" onClick={pasteKey} title="粘贴剪贴板">
                    📋 粘贴
                  </Button>
                  <Show when={props.profile.hasApiKey}>
                    <Button variant="ghost" size="xs" onClick={clearKey} title="清除已保存的密钥">
                      🗑️ 清除
                    </Button>
                  </Show>
                </div>
              }
            />
            <p class="text-[10px] text-slate-500 mt-1">
              密钥仅保存在本机配置文件，不会回传到界面，也不会随行情快照广播。
            </p>
          </div>

          <Show when={(props.profile.extra_headers?.length ?? 0) > 0}>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1">附加请求头（该服务商要求）</label>
              <div class="flex flex-col gap-1">
                <For each={props.profile.extra_headers ?? []}>
                  {(h) => (
                    <div class="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                      <span class="text-slate-500">{h[0]}</span>
                      <span class="truncate">{h[1]}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Card>

      <Card title="连通性测速与诊断" icon="⚡" subtitle="向厂商发起一次真实请求">
        <div class="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            loading={testStatus() === 'testing'}
            onClick={runProbe}
          >
            {testStatus() === 'testing' ? '正在测速...' : '⚡ 测试接口连通性'}
          </Button>
          <Show when={health()}>
            {(h) => (
              <div class="flex items-center gap-2">
                <Show when={h().latencyMs > 0}>
                  <Badge
                    variant={h().latencyMs < 1500 ? 'success' : h().latencyMs < 4000 ? 'warning' : 'danger'}
                  >
                    往返 {h().latencyMs}ms
                  </Badge>
                </Show>
                <Badge variant={h().reachable ? 'success' : 'warning'}>
                  {h().reachable ? '✅ 接口可用' : '⚠️ 未接通'}
                </Badge>
              </div>
            )}
          </Show>
        </div>

        <Show when={testStatus() === 'failed' && testError()}>
          <div class="text-[11px] p-2.5 rounded-lg border font-mono break-all bg-rose-950/20 border-rose-500/20 text-rose-300">
            {testError()}
          </div>
        </Show>

        <Show when={health()}>
          {(h) => (
            <div
              class={`text-[11px] p-2.5 rounded-lg border leading-relaxed ${
                h().reachable
                  ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300'
                  : 'bg-amber-950/20 border-amber-500/20 text-amber-200'
              }`}
            >
              <div>{h().detail}</div>
              <Show when={h().reply}>
                <div class="mt-1 opacity-80">模型返回：{h().reply}</div>
              </Show>
              <Show when={h().status === 'no_key'}>
                <div class="mt-1.5 pt-1.5 border-t border-amber-500/20">
                  当前复盘输出的是本地规则引擎结果，并非大模型分析。
                </div>
              </Show>
            </div>
          )}
        </Show>

        <p class="text-[10px] text-slate-500 leading-relaxed">
          测速会向 <span class="font-mono">{props.profile.base_url || '（未填写）'}</span> 发起一次仅
          {PROBE_TOKENS} 令牌的最小请求，仅验证密钥与模型标识是否可用。
        </p>
      </Card>
    </>
  )
}