import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { BrokerAccount } from '../../types/portfolio'
import './BrokerDropdown.css'

export interface BrokerDropdownProps {
  brokers: BrokerAccount[]
  activeId: string
  onSelect: (brokerId: string) => void
  onOpenCreateModal: () => void
}

export function BrokerDropdown(props: BrokerDropdownProps) {
  const [open, setOpen] = createSignal(false)
  let containerRef: HTMLDivElement | undefined

  const activeBroker = () => {
    return props.brokers.find((b) => b.id === props.activeId) ?? props.brokers[0]
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (containerRef && !containerRef.contains(e.target as Node)) {
      setOpen(false)
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside)
  })

  onCleanup(() => {
    document.removeEventListener('click', handleClickOutside)
  })

  const handleSelect = (id: string) => {
    props.onSelect(id)
    setOpen(false)
  }

  return (
    <div class="broker-dropdown-container" ref={containerRef}>
      <button
        type="button"
        class="broker-dropdown-trigger"
        onClick={() => setOpen(!open())}
        title="切换券商账户"
      >
        <span class="broker-name">{activeBroker()?.name || '选择券商'}</span>
        <svg
          class={`broker-arrow ${open() ? 'open' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          width="12"
          height="12"
        >
          <path
            fill-rule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <Show when={open()}>
        <div class="broker-dropdown-menu">
          <div class="broker-menu-header">切换券商账户</div>
          <div class="broker-menu-list">
            <For each={props.brokers}>
              {(b) => {
                const isSelected = () => b.id === (activeBroker()?.id ?? '')
                return (
                  <button
                    type="button"
                    class={`broker-menu-item ${isSelected() ? 'selected' : ''}`}
                    onClick={() => handleSelect(b.id)}
                  >
                    <span class="broker-item-name">{b.name}</span>
                    <Show when={isSelected()}>
                      <span class="broker-selected-check">✓</span>
                    </Show>
                  </button>
                )
              }}
            </For>
          </div>
          <div class="broker-menu-footer">
            <button
              type="button"
              class="broker-add-btn"
              onClick={() => {
                setOpen(false)
                props.onOpenCreateModal()
              }}
            >
              + 新增券商账户
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
