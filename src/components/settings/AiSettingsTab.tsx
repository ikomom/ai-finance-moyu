import { createSignal, onMount, Show } from 'solid-js'
import type { LlmConfig, LlmProfile } from '../../types/agent'
import { DEFAULT_LLM_CONFIG } from '../../types/agent'
import { fetchAgentConfig, saveAgentConfig } from '../../services/agent'
import { Button, Card, Input, Slider, Switch } from '../ui'

import { AI_PRESETS, profileFromPreset, type ProviderPreset } from './aiPresets'
import { AiProviderPicker } from './AiProviderPicker'
import { ProfileList } from './ProfileList'
import { ProfileCredentials } from './ProfileCredentials'

export function AiSettingsTab() {
  const [config, setConfig] = createSignal<LlmConfig>({ ...DEFAULT_LLM_CONFIG })
  /** Profile currently open in the editor beside the list. */
  const [editingId, setEditingId] = createSignal<string>(DEFAULT_LLM_CONFIG.active_profile_id)
  const [saveMsg, setSaveMsg] = createSignal('')
  const [showAdvanced, setShowAdvanced] = createSignal(false)

  const profile = () => config().profiles.find((p) => p.id === editingId())

  /** Patch the profile being edited, leaving every other one untouched. */
  const patchProfile = (patch: Partial<LlmProfile>) =>
    setConfig((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.id === editingId() ? { ...p, ...patch } : p)),
    }))

  onMount(async () => {
    const loaded = await fetchAgentConfig()
    const merged: LlmConfig = {
      ...DEFAULT_LLM_CONFIG,
      ...loaded,
      profiles: loaded.profiles?.length ? loaded.profiles : DEFAULT_LLM_CONFIG.profiles,
    }
    setConfig(merged)
    setEditingId(merged.active_profile_id || merged.profiles[0]?.id)
  })

  /**
   * Adopt a preset into the edited profile.
   *
   * The key is deliberately left alone: switching to a different vendor on an
   * existing profile would otherwise either leak the previous vendor's key to
   * the new endpoint or silently drop it.
   */
  const applyPreset = (p: ProviderPreset) => {
    patchProfile({
      provider: p.id,
      label: p.name,
      base_url: p.baseUrl,
      model_name: p.defaultModel,
      extra_headers: p.requiredHeaders?.map((h) => [...h] as [string, string]) ?? [],
    })
  }

  const addProfile = (p: ProviderPreset = AI_PRESETS[0]) => {
    // Ids must stay unique: the backend matches stored keys by id, so a
    // duplicate id would make one provider's credential overwrite another's.
    const base = p.id
    let id = base
    let n = 2
    while (config().profiles.some((x) => x.id === id)) {
      id = `${base}_${n++}`
    }
    const next = profileFromPreset(p)
    setConfig((prev) => ({
      ...prev,
      profiles: [
        ...prev.profiles,
        { ...next, id, label: n > 2 ? `${p.name} ${n - 1}` : p.name },
      ],
    }))
    setEditingId(id)
  }

  const removeProfile = (id: string) => {
    const remaining = config().profiles.filter((p) => p.id !== id)
    setConfig((prev) => ({
      ...prev,
      profiles: remaining,
      active_profile_id:
        prev.active_profile_id === id ? remaining[0]?.id ?? '' : prev.active_profile_id,
    }))
    if (editingId() === id) setEditingId(remaining[0]?.id ?? '')
  }

  const handleSave = async () => {
    try {
      await saveAgentConfig(config())
      // Keys are never echoed back by the backend; drop them from the form so
      // a later save does not send the placeholder back as a real value.
      setConfig((prev) => ({
        ...prev,
        profiles: prev.profiles.map((p) => ({ ...p, api_key: '' })),
      }))
      setSaveMsg('✅ 配置已保存')
      window.setTimeout(() => setSaveMsg(''), 2500)
    } catch (e) {
      // Never swallow this: a silent failure here is what made the whole
      // subsystem look dead while the form kept saying nothing.
      setSaveMsg(`保存失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * Mirrors the server-side `supports_native_search` derivation: sending
   * `enable_search` where no channel exists is a 400, so the UI has to say so
   * rather than let the user flip a switch that hard-fails.
   */
  const searchCapable = () => {
    const base = profile()?.base_url ?? ''
    return (
      (base.includes('dashscope') || base.includes('aliyuncs') || base.includes('moonshot')) &&
      !base.includes('11434')
    )
  }

  return (
    <div class="flex flex-col gap-4 text-slate-200">
      <div class="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div>
          <h2 class="text-sm font-semibold text-white flex items-center gap-2">
            <span>🤖</span>
            <span>AI 智投副驾驶</span>
          </h2>
          <p class="text-xs text-slate-400 mt-0.5">
            可配置多个服务商，每个服务商拥有独立的密钥与模型；复盘页可直接切换。
          </p>
          <Show when={saveMsg()}>
            <p class="text-[11px] text-emerald-400 mt-1">{saveMsg()}</p>
          </Show>
        </div>
        <Button variant="primary" size="sm" onClick={handleSave}>
          保存配置
        </Button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div class="md:col-span-5 flex flex-col gap-3">
          <Card title="已配置服务商" icon="🗂️" subtitle="点击切换，右侧编辑详情">
            <ProfileList
              profiles={config().profiles}
              activeId={editingId()}
              onSelect={setEditingId}
              onAdd={() => addProfile()}
              onRemove={removeProfile}
            />
          </Card>
        </div>

        <div class="md:col-span-7 flex flex-col gap-3">
          <Show when={profile()} fallback={<p class="text-xs text-slate-500">请先添加一个服务商。</p>}>
            {(p) => (
              <>
                <AiProviderPicker
                  profile={p()}
                  onSelectProvider={applyPreset}
                  onPatch={patchProfile}
                />

                <ProfileCredentials
                  profile={p()}
                  onPatch={patchProfile}
                  onSaveConfig={handleSave}
                />

                <Card
                  title="高级推理调优"
                  icon="🎛️"
                  subtitle="采样温度、令牌数与联网"
                  action={
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowAdvanced(!showAdvanced())}
                    >
                      {showAdvanced() ? '收起 ▲' : '展开 ▼'}
                    </Button>
                  }
                >
                  <Show when={showAdvanced()}>
                    <div class="flex flex-col gap-3.5 pt-1">
                      <Slider
                        label="采样温度 (Temperature)"
                        min={0}
                        max={2}
                        step={0.05}
                        value={config().temperature}
                        onChange={(v) => setConfig({ ...config(), temperature: v })}
                      />

                      <div class="flex flex-col gap-1">
                        <label class="text-[11px] text-slate-400 font-medium">
                          最大输出令牌 (Max Tokens)
                        </label>
                        <Input
                          type="number"
                          value={config().max_tokens}
                          onInput={(v) =>
                            setConfig({ ...config(), max_tokens: parseInt(v, 10) || 4096 })
                          }
                        />
                      </div>

                      <div class="pt-2 border-t border-white/[0.06]">
                        <Switch
                          checked={config().enable_search}
                          onChange={(c) => setConfig({ ...config(), enable_search: c })}
                          label="启用供应商原生联网搜索"
                          description={
                            searchCapable()
                              ? '当前服务商支持原生搜索通道'
                              : '当前服务商没有原生搜索通道，勾选不会生效'
                          }
                        />
                      </div>
                    </div>
                  </Show>
                </Card>
              </>
            )}
          </Show>
        </div>
      </div>

      <div class="text-[11px] text-slate-400 bg-sky-500/[0.06] border border-sky-500/20 p-2.5 rounded-lg flex items-center gap-2">
        <span>💡</span>
        <span>
          <strong>确定性量化保底</strong>：当前服务商未完成配置时，智投副驾驶自动降级为本地 Rust
          确定性量化规则引擎诊断，零网络依赖且无白屏。
        </span>
      </div>
    </div>
  )
}