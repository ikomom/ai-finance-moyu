import { For, Show } from 'solid-js'
import type { LlmProfile } from '../../types/agent'
import { AI_PRESETS, PRESET_BY_ID, type ProviderPreset } from './aiPresets'

export interface AiProviderPickerProps {
  profile: LlmProfile
  onSelectProvider: (preset: ProviderPreset) => void
  onPatch: (patch: Partial<LlmProfile>) => void
}

/**
 * Provider / model picker for the profile being edited.
 *
 * Built-in providers offer a fixed model list and no free-text field: the ids
 * are verified against vendor documentation, and a typo produces a
 * `model_unavailable` error at request time instead of a bad config. Custom
 * endpoints are the only case where a hand-written id makes sense.
 */
export function AiProviderPicker(props: AiProviderPickerProps) {
  const current = () => PRESET_BY_ID.get(props.profile.provider) ?? AI_PRESETS[AI_PRESETS.length - 1]
  const isCustom = () => props.profile.provider === 'custom'

  return (
    <div class="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
      <div class="grid grid-cols-3 gap-2">
        <For each={AI_PRESETS}>
          {(p) => (
            <button
              type="button"
              class="flex items-center gap-1.5 p-2 rounded-lg border text-left transition-all cursor-pointer"
              classList={{
                'border-sky-500/60 bg-sky-500/10': props.profile.provider === p.id,
                'border-white/[0.08] hover:border-white/20': props.profile.provider !== p.id,
              }}
              onClick={() => props.onSelectProvider(p)}
              title={p.note}
            >
              <span class="text-sm">{p.icon}</span>
              <span class="text-[11px] truncate">{p.name}</span>
            </button>
          )}
        </For>
      </div>

      <Show
        when={!isCustom() && current().curatedModels.length > 0}
        fallback={
          <div class="flex flex-col gap-1">
            <label class="text-[11px] text-slate-400 font-medium">
              模型标识（自定义端点需手动填写）
            </label>
            <input
              class="w-full px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-slate-200 outline-none focus:border-sky-500/50 font-mono"
              value={props.profile.model_name}
              onInput={(e) => props.onPatch({ model_name: e.currentTarget.value })}
              placeholder="例如 deepseek-v4-flash"
            />
          </div>
        }
      >
        <div class="flex flex-col gap-1.5">
          <span class="text-[11px] text-slate-400 font-medium">
            可选模型（{current().name} 官方标识）
          </span>
          <div class="flex flex-wrap gap-1.5">
            <For each={current().curatedModels}>
              {(m) => (
                <button
                  type="button"
                  class="text-[11px] px-2 py-1 rounded-md border font-mono transition-all cursor-pointer"
                  classList={{
                    'border-sky-500/60 bg-sky-500/10 text-sky-200': props.profile.model_name === m,
                    'border-white/10 text-slate-300 hover:border-white/25': props.profile.model_name !== m,
                  }}
                  onClick={() => props.onPatch({ model_name: m })}
                >
                  {m}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={current().note}>
        <p class="text-[11px] text-slate-500 leading-relaxed">{current().note}</p>
      </Show>
    </div>
  )
}