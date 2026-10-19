import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { LlmProfile } from '../../types/agent'
import { PRESET_BY_ID } from '../settings/aiPresets'
import './ModelSwitcher.css'

export interface ModelSwitcherProps {
  profiles: LlmProfile[]
  activeId: string
  /** Rejects an id the backend refuses; surfaces the reason to the user. */
  onSelect: (profileId: string) => Promise<void>
  disabled?: boolean
}

/**
 * Profile label for the collapsed trigger.
 *
 * Shows `label · model` when the profile names more than one thing worth
 * telling apart — two entries both called "DeepSeek" pointing at different
 * models are indistinguishable in a one-line trigger otherwise.
 */
function displayName(p: LlmProfile): string {
  const preset = PRESET_BY_ID.get(p.provider)
  if (p.provider === 'custom' || !preset) return p.label
  return p.model_name ? `${p.label} · ${p.model_name}` : p.label
}

/**
 * Why an entry cannot be selected, or `null` when it can.
 *
 * Kept as a plain function rather than a precomputed flag so a profile edited
 * in another window cannot leave a stale "enabled" badge behind.
 */
function blockedReason(p: LlmProfile): string | null {
  if (p.base_url.trim() && p.model_name.trim() && p.hasApiKey) return null
  // A loopback Ollama endpoint needs no credential.
  const local = /localhost|127\.0\.0\.1|11434/i.test(p.base_url)
  if (local && p.base_url.trim() && p.model_name.trim()) return null

  const missing: string[] = []
  if (!p.base_url.trim()) missing.push('接口地址')
  if (!p.model_name.trim()) missing.push('模型标识')
  if (!local) missing.push('API Key')
  return `缺少${missing.join('、')}`
}

/**
 * Model dropdown for the copilot header.
 *
 * Unconfigured profiles stay visible but cannot be picked — hiding them would
 * leave a user with no idea the option exists, while letting them pick one
 * would silently route to the local rule engine and look like the model chose
 * to answer from a script.
 */
export function ModelSwitcher(props: ModelSwitcherProps) {
  const [open, setOpen] = createSignal(false)
  const [error, setError] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  let rootRef: HTMLDivElement | undefined
  let triggerRef: HTMLButtonElement | undefined

  const active = () => props.profiles.find((p) => p.id === props.activeId) ?? props.profiles[0]

  const pick = async (p: LlmProfile) => {
    if (blockedReason(p) || busy()) return
    setBusy(true)
    setError('')
    try {
      await props.onSelect(p.id)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onDocPointerDown = (ev: MouseEvent) => {
    if (!rootRef?.contains(ev.target as Node)) setOpen(false)
  }

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      setOpen(false)
      triggerRef?.focus()
    }
  }

  onMount(() => {
    document.addEventListener('mousedown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
  })

  onCleanup(() => {
    document.removeEventListener('mousedown', onDocPointerDown)
    document.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div class="model-switcher" ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        class="model-switcher-trigger"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open()}
        onClick={() => setOpen(!open())}
        title={active() ? `当前模型：${displayName(active()!)}` : '未配置模型'}
      >
        <span class="model-switcher-label">
          {active() ? displayName(active()!) : '未配置模型'}
        </span>
        <span class="model-switcher-caret">{open() ? '▴' : '▾'}</span>
      </button>

      <Show when={open()}>
        <div class="model-switcher-menu" role="listbox">
          <Show when={props.profiles.length === 0}>
            <div class="model-switcher-empty">尚未配置任何模型，请先到设置中添加</div>
          </Show>

          <For each={props.profiles}>
            {(p) => {
              const blocked = () => blockedReason(p)
              const isActive = () => p.id === active()?.id
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive()}
                  aria-disabled={blocked() !== null}
                  class="model-switcher-item"
                  classList={{ active: isActive(), blocked: blocked() !== null }}
                  disabled={blocked() !== null || busy()}
                  onClick={() => pick(p)}
                >
                  <span class="model-switcher-item-main">
                    <span class="model-switcher-item-label">{displayName(p)}</span>
                    <Show when={blocked()}>
                      <span class="model-switcher-item-hint">{blocked()}</span>
                    </Show>
                  </span>
                  <Show when={isActive()}>
                    <span class="model-switcher-check">✓</span>
                  </Show>
                </button>
              )
            }}
          </For>

          <Show when={error()}>
            <div class="model-switcher-error">{error()}</div>
          </Show>
        </div>
      </Show>
    </div>
  )
}