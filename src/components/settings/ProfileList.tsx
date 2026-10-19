import { For, Show } from 'solid-js'
import type { LlmProfile } from '../../types/agent'
import { PRESET_BY_ID } from './aiPresets'

export interface ProfileListProps {
  profiles: LlmProfile[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

/**
 * Whether an endpoint needs a credential.
 *
 * Mirrors `LlmProfile::is_keyless` in `src-tauri/src/agent/profile.rs`: a
 * loopback Ollama is usable with no key, so demanding one would mark the only
 * offline provider as broken.
 */
function isLocal(p: LlmProfile): boolean {
  return /localhost|127\.0\.0\.1|11434/i.test(p.base_url)
}

/** What is still missing before this profile can be used, if anything. */
export function missingParts(p: LlmProfile): string[] {
  const missing: string[] = []
  if (!p.base_url.trim()) missing.push('接口地址')
  if (!p.model_name.trim()) missing.push('模型标识')
  if (!isLocal(p) && !p.hasApiKey) missing.push('API Key')
  return missing
}

export function isProfileReady(p: LlmProfile): boolean {
  return missingParts(p).length === 0
}

/**
 * Configured providers, one card each.
 *
 * Mirrors the layout of the model screens this replaces: a row per provider
 * with an explicit state dot, so an unconfigured entry is visibly distinct
 * from a working one at a glance.
 */
export function ProfileList(props: ProfileListProps) {
  return (
    <div class="flex flex-col gap-2">
      <For each={props.profiles}>
        {(p) => {
          const preset = () => PRESET_BY_ID.get(p.provider)
          const ready = () => isProfileReady(p)
          const missing = () => missingParts(p)

          return (
            <div
              class="flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer"
              classList={{
                'border-sky-500/50 bg-sky-500/[0.07]': props.activeId === p.id,
                'border-white/[0.08] hover:border-white/[0.16]': props.activeId !== p.id,
              }}
              onClick={() => props.onSelect(p.id)}
            >
              <span class="text-base leading-none">{preset()?.icon ?? '🛠️'}</span>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium truncate">{p.label}</span>
                  <Show when={preset()?.id !== p.provider}>
                    <span class="text-[10px] px-1.5 py-0.5 rounded border border-white/15 text-slate-400">
                      自定义
                    </span>
                  </Show>
                  <Show when={p.model_name}>
                    <span class="text-[11px] font-mono text-slate-400 truncate">{p.model_name}</span>
                  </Show>
                </div>
                <Show when={!ready()}>
                  <p class="text-[11px] text-amber-400 mt-0.5">缺少：{missing().join('、')}</p>
                </Show>
              </div>

              <span
                class="w-2 h-2 rounded-full flex-shrink-0"
                classList={{
                  'bg-emerald-400': ready(),
                  'bg-amber-400': !ready(),
                }}
                title={ready() ? '配置完整' : `缺少：${missing().join('、')}`}
              />

              <div class="flex items-center gap-1 flex-shrink-0">
                <Show when={props.profiles.length > 1}>
                  <button
                    type="button"
                    class="px-2 py-1 rounded border border-white/10 text-[11px] text-slate-300 hover:bg-white/[0.06]"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onRemove(p.id)
                    }}
                    title="删除此服务商配置"
                  >
                    删除
                  </button>
                </Show>
              </div>
            </div>
          )
        }}
      </For>

      <button
        type="button"
        class="py-2 rounded-lg border border-dashed border-white/15 text-xs text-slate-400 hover:border-white/30 hover:text-slate-300 transition-colors"
        onClick={props.onAdd}
      >
        ＋ 添加模型服务商
      </button>
    </div>
  )
}