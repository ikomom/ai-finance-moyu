import { createEffect, For, type JSX, Show } from 'solid-js'
import './PillTabs.css'

export interface PillTabItem {
  id: string | number
  label: string
  title?: string
}

export interface PillTabsProps {
  items: PillTabItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  onItemContextMenu?: (item: PillTabItem, index: number, event: MouseEvent) => void
  prefix?: JSX.Element
  class?: string
}

/**
 * 迷你/看板通用的横向滚动胶囊标签栏 (自动边缘吸附对齐、平滑滚动).
 */
export function PillTabs(props: PillTabsProps) {
  let tabsContainerRef: HTMLDivElement | undefined
  const tabRefs: (HTMLButtonElement | undefined)[] = []

  const scrollToActiveTab = (idx: number, smooth: boolean = true) => {
    if (!tabsContainerRef) return
    const el = tabRefs[idx]
    if (!el) return

    const containerRect = tabsContainerRef.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()

    if (elRect.left < containerRect.left) {
      const diff = containerRect.left - elRect.left + 8
      tabsContainerRef.scrollBy({
        left: -diff,
        behavior: smooth ? 'smooth' : 'auto',
      })
    } else if (elRect.right > containerRect.right) {
      const diff = elRect.right - containerRect.right + 8
      tabsContainerRef.scrollBy({
        left: diff,
        behavior: smooth ? 'smooth' : 'auto',
      })
    }
  }

  createEffect(() => {
    const idx = props.selectedIndex
    requestAnimationFrame(() => {
      scrollToActiveTab(idx, true)
    })
  })

  return (
    <div class={`mini-tabs-bar ${props.class ?? ''}`} data-tauri-drag-region>
      <Show when={props.prefix}>
        <div class="mini-tabs-prefix">{props.prefix}</div>
      </Show>
      <div
        class="mini-tabs"
        ref={tabsContainerRef}
        data-tauri-drag-region
      >
        <For each={props.items}>
          {(item, i) => (
            <button
              ref={(el) => (tabRefs[i()] = el)}
              type="button"
              class="mini-tab stock-tab"
              classList={{ active: i() === props.selectedIndex }}
              onClick={() => props.onSelect(i())}
              onContextMenu={(e) => {
                if (props.onItemContextMenu) {
                  e.preventDefault()
                  e.stopPropagation()
                  props.onItemContextMenu(item, i(), e)
                }
              }}
              title={item.title ?? item.label}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>
    </div>
  )
}
