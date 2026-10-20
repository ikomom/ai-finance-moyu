import { Show } from 'solid-js'

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  label?: string
  unit?: string
  disabled?: boolean
  class?: string
  onChange: (val: number) => void
}

export function Slider(props: SliderProps) {
  // A caller feeding `undefined` (an IPC payload that omitted the field) used to
  // throw inside the render and take the whole page down with it, so every read
  // goes through these guarded accessors instead of touching `props` directly.
  const safeValue = () => {
    const v = Number(props.value)
    if (!Number.isFinite(v)) return props.min
    return Math.min(Math.max(v, props.min), props.max)
  }
  const displayValue = () => {
    const v = Number(props.value)
    return Number.isFinite(v) ? v.toFixed(2) : '—'
  }

  return (
    <div class={`flex flex-col gap-1.5 w-full ${props.class ?? ''}`}>
      <div class="flex items-center justify-between text-xs">
        <Show when={props.label}>
          <span class="font-medium text-slate-300">{props.label}</span>
        </Show>
        <span class="font-mono text-[11px] font-semibold text-sky-400 bg-sky-500/15 px-2 py-0.5 rounded border border-sky-500/30">
          {displayValue()}{props.unit ?? ''}
        </span>
      </div>

      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.05}
        value={safeValue()}
        disabled={props.disabled}
        onInput={(e) => props.onChange(parseFloat(e.currentTarget.value))}
        class="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none"
      />
    </div>
  )
}
