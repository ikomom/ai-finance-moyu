import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { listen } from '@tauri-apps/api/event'
import { snapshot } from '../../store'
import {
  ALL_GROUP_ID,
  computeGroupCounts,
  createWatchGroup,
  DEFAULT_GROUP_ID,
  moveWatchItem,
  setActiveWatchGroup,
} from '../../services/watchlistGroups'
import './GroupDropdown.css'

export interface GroupDropdownProps {
  class?: string
}

export function GroupDropdown(props: GroupDropdownProps) {
  const [open, setOpen] = createSignal(false)
  const [showCreateModal, setShowCreateModal] = createSignal(false)
  const [newGroupName, setNewGroupName] = createSignal('')
  const [pendingMoveCode, setPendingMoveCode] = createSignal<string | null>(null)
  let containerRef: HTMLDivElement | undefined
  let inputRef: HTMLInputElement | undefined

  const s = () => snapshot()
  const groups = () => s()?.config.groups ?? [{ id: DEFAULT_GROUP_ID, name: '默认自选' }]
  const activeGroupId = () => s()?.config.activeGroupId ?? ALL_GROUP_ID

  const activeLabel = () => {
    const aid = activeGroupId()
    if (!aid || aid === ALL_GROUP_ID) return '全部'
    const match = groups().find((g) => g.id === aid)
    return match?.name ?? '自选'
  }

  const counts = () => computeGroupCounts(s()?.config.watchlist ?? [], groups())

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation()
    setOpen(!open())
  }

  const handleSelectGroup = async (gid: string) => {
    setOpen(false)
    try {
      await setActiveWatchGroup(gid === ALL_GROUP_ID ? null : gid)
    } catch (e) {
      console.error(e)
    }
  }

  const handleOpenCreate = (code?: string) => {
    setOpen(false)
    setNewGroupName('')
    setPendingMoveCode(code ?? null)
    setShowCreateModal(true)
    setTimeout(() => inputRef?.focus(), 50)
  }

  const handleConfirmCreate = async () => {
    const name = newGroupName().trim()
    if (!name) return
    try {
      const newGrp = await createWatchGroup(name)
      if (pendingMoveCode()) {
        await moveWatchItem(pendingMoveCode()!, newGrp.id)
      }
      await setActiveWatchGroup(newGrp.id)
      setShowCreateModal(false)
      setPendingMoveCode(null)
    } catch (e) {
      console.error(e)
    }
  }

  onMount(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef && !containerRef.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleOutsideClick)

    // Listen to right-click "+ 新建分组…" action
    let unlisten: (() => void) | undefined
    try {
      listen<{ code?: string }>('open-new-group-modal', (evt) => {
        handleOpenCreate(evt.payload?.code)
      }).then((fn) => {
        unlisten = fn
      }).catch(() => {})
    } catch {}

    onCleanup(() => {
      document.removeEventListener('click', handleOutsideClick)
      unlisten?.()
    })
  })

  return (
    <div class={`group-dropdown-container ${props.class ?? ''}`} ref={containerRef}>
      <button
        type="button"
        class="group-dropdown-trigger"
        onClick={handleToggle}
        title="切换自选股票分组"
      >
        <span>{activeLabel()}</span>
        <span class="group-dropdown-caret" classList={{ open: open() }}>
          ▾
        </span>
      </button>

      <Show when={open()}>
        <div class="group-dropdown-menu">
          <div
            class="group-dropdown-item"
            classList={{ active: activeGroupId() === ALL_GROUP_ID || !activeGroupId() }}
            onClick={() => handleSelectGroup(ALL_GROUP_ID)}
          >
            <span>全部</span>
            <span class="count">({counts()[ALL_GROUP_ID] ?? 0})</span>
          </div>

          <For each={groups()}>
            {(g) => (
              <div
                class="group-dropdown-item"
                classList={{ active: activeGroupId() === g.id }}
                onClick={() => handleSelectGroup(g.id)}
              >
                <span>{g.name}</span>
                <span class="count">({counts()[g.id] ?? 0})</span>
              </div>
            )}
          </For>

          <div class="group-dropdown-divider" />

          <div
            class="group-dropdown-item group-dropdown-action"
            onClick={() => handleOpenCreate()}
          >
            + 新建分组
          </div>
        </div>
      </Show>

      {/* Mini modal for creating group */}
      <Show when={showCreateModal()}>
        <div class="group-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div class="group-modal" onClick={(e) => e.stopPropagation()}>
            <div class="group-modal-title">新建自选分组</div>
            <input
              ref={inputRef}
              class="group-modal-input"
              placeholder="请输入分组名称..."
              value={newGroupName()}
              onInput={(e) => setNewGroupName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConfirmCreate()
                if (e.key === 'Escape') setShowCreateModal(false)
              }}
            />
            <div class="group-modal-actions">
              <button
                type="button"
                class="group-modal-btn cancel"
                onClick={() => setShowCreateModal(false)}
              >
                取消
              </button>
              <button
                type="button"
                class="group-modal-btn confirm"
                onClick={handleConfirmCreate}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
