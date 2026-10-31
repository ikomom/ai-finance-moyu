//! 挂件窗口通用的单选下拉。
//!
//! 原生 `<select>` 的展开面板由 WebView2 交系统绘制，深色主题下必然是白底；
//! 而挂件窗口没有引入 Tailwind（只有设置窗口有），所以这里必须手写样式。

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import './SelectMenu.css'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectMenuProps {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** `up` 用于贴着面板底部的操作条，避免菜单被裁掉 */
  placement?: 'down' | 'up'
  title?: string
  placeholder?: string
  class?: string
}

export function SelectMenu(props: SelectMenuProps) {
  const [open, setOpen] = createSignal(false)
  let containerRef: HTMLDivElement | undefined

  const currentLabel = () =>
    props.options.find((o) => o.value === props.value)?.label ?? props.placeholder ?? '请选择'

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open()) {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    // 捕获阶段抢先处理，别让 Esc 冒泡上去把整个弹层关掉
    document.addEventListener('keydown', onEsc, true)
    onCleanup(() => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onEsc, true)
    })
  })

  const pick = (value: string) => {
    setOpen(false)
    if (value !== props.value) props.onChange(value)
  }

  return (
    <div
      ref={containerRef}
      class={`select-menu ${props.class ?? ''}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class="select-menu-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        title={props.title}
      >
        <span class="select-menu-current">{currentLabel()}</span>
        <span class="select-menu-caret" classList={{ open: open() }}>
          ▾
        </span>
      </button>

      <Show when={open()}>
        <div class={`select-menu-panel ${props.placement === 'up' ? 'is-up' : 'is-down'}`} data-select-panel>
          <For each={props.options}>
            {(opt) => (
              <button
                type="button"
                class="select-menu-item"
                classList={{ active: opt.value === props.value }}
                onClick={() => pick(opt.value)}
              >
                {opt.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
