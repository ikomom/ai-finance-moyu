import { Show, type JSX } from 'solid-js'

export interface InputProps {
  id?: string
  type?: string
  value?: string | number
  placeholder?: string
  disabled?: boolean
  prefix?: JSX.Element
  suffix?: JSX.Element
  class?: string
  onInput?: (val: string) => void
  onChange?: (val: string) => void
  onKeyDown?: (e: KeyboardEvent) => void
}

export function Input(props: InputProps) {
  return (
    <div class={`relative flex items-center w-full rounded-lg bg-black/25 border border-white/10 hover:border-white/20 focus-within:!border-sky-500/80 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all ${props.disabled ? 'opacity-50 cursor-not-allowed' : ''} ${props.class ?? ''}`}>
      <Show when={props.prefix}>
        <div class="pl-2.5 pr-1 text-slate-400 select-none shrink-0 text-xs flex items-center">
          {props.prefix}
        </div>
      </Show>

      <input
        id={props.id}
        type={props.type ?? 'text'}
        value={props.value ?? ''}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onInput={(e) => props.onInput?.(e.currentTarget.value)}
        onChange={(e) => props.onChange?.(e.currentTarget.value)}
        onKeyDown={props.onKeyDown}
        class="w-full bg-transparent px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed font-mono"
      />

      <Show when={props.suffix}>
        <div class="pr-1.5 pl-1 flex items-center shrink-0">
          {props.suffix}
        </div>
      </Show>
    </div>
  )
}
