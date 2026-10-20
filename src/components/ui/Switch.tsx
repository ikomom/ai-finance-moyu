import { Show, type JSX } from 'solid-js'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: JSX.Element
  description?: string
  disabled?: boolean
  class?: string
}

export function Switch(props: SwitchProps) {
  return (
    <label class={`inline-flex items-center justify-between gap-3 select-none cursor-pointer group ${props.disabled ? 'opacity-40 cursor-not-allowed' : ''} ${props.class ?? ''}`}>
      <Show when={props.label || props.description}>
        <div class="flex flex-col">
          <Show when={props.label}>
            <span class="text-xs font-medium text-slate-200 group-hover:text-white transition-colors">
              {props.label}
            </span>
          </Show>
          <Show when={props.description}>
            <span class="text-[11px] text-slate-400 leading-tight">
              {props.description}
            </span>
          </Show>
        </div>
      </Show>

      <div
        onClick={(e) => {
          e.preventDefault()
          if (!props.disabled) props.onChange(!props.checked)
        }}
        class={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-white/10 transition-colors duration-200 ease-in-out focus:outline-none ${props.checked ? 'bg-sky-500 border-sky-400' : 'bg-white/10'}`}
      >
        <span
          class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${props.checked ? 'translate-x-4 mt-[1px]' : 'translate-x-0.5 mt-[1px]'}`}
        />
      </div>
    </label>
  )
}
