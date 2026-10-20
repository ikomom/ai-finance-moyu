import { Show, type JSX } from 'solid-js'

export interface CardProps {
  title?: JSX.Element
  icon?: JSX.Element
  subtitle?: string
  action?: JSX.Element
  children: JSX.Element
  footer?: JSX.Element
  class?: string
}

export function Card(props: CardProps) {
  return (
    <div class={`rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md p-4 flex flex-col gap-3.5 shadow-sm transition-all hover:border-white/[0.12] ${props.class ?? ''}`}>
      <Show when={props.title || props.icon || props.action}>
        <div class="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
          <div class="flex items-center gap-2">
            <Show when={props.icon}>
              <span class="text-base flex items-center">{props.icon}</span>
            </Show>
            <div class="flex flex-col">
              <Show when={props.title}>
                <h3 class="text-xs font-semibold text-slate-100 tracking-wide m-0">
                  {props.title}
                </h3>
              </Show>
              <Show when={props.subtitle}>
                <span class="text-[11px] text-slate-400 mt-0.5">
                  {props.subtitle}
                </span>
              </Show>
            </div>
          </div>
          <Show when={props.action}>
            <div class="flex items-center gap-2">{props.action}</div>
          </Show>
        </div>
      </Show>

      <div class="flex flex-col gap-3">{props.children}</div>

      <Show when={props.footer}>
        <div class="pt-2 border-t border-white/[0.06] text-[11px] text-slate-400">
          {props.footer}
        </div>
      </Show>
    </div>
  )
}
