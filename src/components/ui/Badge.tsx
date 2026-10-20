import type { JSX } from 'solid-js'

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent' | 'outline'
  size?: 'xs' | 'sm' | 'md'
  children: JSX.Element
  class?: string
}

export function Badge(props: BadgeProps) {
  const variantClasses = () => {
    switch (props.variant) {
      case 'success':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      case 'warning':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      case 'danger':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30'
      case 'accent':
        return 'bg-sky-500/15 text-sky-400 border-sky-500/30'
      case 'outline':
        return 'bg-transparent text-slate-300 border-white/20'
      default:
        return 'bg-white/10 text-slate-300 border-white/15'
    }
  }

  const sizeClasses = () => {
    switch (props.size) {
      case 'xs':
        return 'text-[10px] px-1.5 py-0.5'
      case 'md':
        return 'text-xs px-2.5 py-1'
      default:
        return 'text-[11px] px-2 py-0.5'
    }
  }

  return (
    <span
      class={`inline-flex items-center gap-1 font-medium rounded-full border transition-all ${variantClasses()} ${sizeClasses()} ${props.class ?? ''}`}
    >
      {props.children}
    </span>
  )
}
