import { Show, type JSX } from 'solid-js'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
  size?: 'xs' | 'sm' | 'md'
  loading?: boolean
  disabled?: boolean
  icon?: JSX.Element
  children?: JSX.Element
  class?: string
  type?: 'button' | 'submit' | 'reset'
  title?: string
  onClick?: (e: MouseEvent) => void
}

export function Button(props: ButtonProps) {
  const variantClasses = () => {
    switch (props.variant) {
      case 'secondary':
        return 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/10 active:scale-[0.98]'
      case 'outline':
        return 'bg-transparent hover:bg-white/[0.08] text-slate-300 border border-white/20 active:scale-[0.98]'
      case 'ghost':
        return 'bg-transparent hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 border-none'
      case 'danger':
        return 'bg-rose-600/80 hover:bg-rose-600 text-white shadow-sm shadow-rose-900/40 active:scale-[0.98]'
      case 'success':
        return 'bg-emerald-600/80 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-900/40 active:scale-[0.98]'
      default:
        return 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-900/50 active:scale-[0.98]'
    }
  }

  const sizeClasses = () => {
    switch (props.size) {
      case 'xs':
        return 'text-[11px] px-2 py-1 rounded-md'
      case 'md':
        return 'text-[13px] px-4 py-2 rounded-lg'
      default:
        return 'text-[12px] px-3 py-1.5 rounded-md'
    }
  }

  return (
    <button
      type={props.type ?? 'button'}
      title={props.title}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
      class={`inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none ${variantClasses()} ${sizeClasses()} ${props.class ?? ''}`}
    >
      <Show when={props.loading}>
        <svg class="animate-spin -ml-0.5 h-3.5 w-3.5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </Show>
      <Show when={!props.loading && props.icon}>
        <span class="inline-flex shrink-0">{props.icon}</span>
      </Show>
      <Show when={props.children}>
        <span>{props.children}</span>
      </Show>
    </button>
  )
}
