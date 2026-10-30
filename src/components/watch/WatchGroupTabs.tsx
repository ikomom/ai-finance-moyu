import { createSignal, For, Show } from 'solid-js'
import type { WatchGroup } from '../../types'
import { ALL_GROUP_ID, DEFAULT_GROUP_ID } from '../../services/watchlistGroups'
import './WatchGroupTabs.css'

export interface WatchGroupTabsProps {
  groups: WatchGroup[]
  activeGroupId: string
  counts: Record<string, number>
  onSelectGroup: (groupId: string) => void
  onCreateGroup: (name: string) => Promise<void> | void
  onRenameGroup: (id: string, newName: string) => Promise<void> | void
  onDeleteGroup: (id: string, moveToDefault: boolean) => Promise<void> | void
}

export function WatchGroupTabs(props: WatchGroupTabsProps) {
  const [showAddModal, setShowAddModal] = createSignal(false)
  const [newGroupName, setNewGroupName] = createSignal('')

  const [renameGroupTarget, setRenameGroupTarget] = createSignal<WatchGroup | null>(null)
  const [renameValue, setRenameValue] = createSignal('')

  const [deleteGroupTarget, setDeleteGroupTarget] = createSignal<WatchGroup | null>(null)
  const [moveToDefaultChecked, setMoveToDefaultChecked] = createSignal(true)

  const handleOpenAdd = () => {
    setNewGroupName('')
    setShowAddModal(true)
  }

  const handleConfirmAdd = async () => {
    const name = newGroupName().trim()
    if (!name) return
    await props.onCreateGroup(name)
    setShowAddModal(false)
  }

  const handleOpenRename = (g: WatchGroup, e: MouseEvent) => {
    e.stopPropagation()
    setRenameGroupTarget(g)
    setRenameValue(g.name)
  }

  const handleConfirmRename = async () => {
    const target = renameGroupTarget()
    const name = renameValue().trim()
    if (!target || !name) return
    await props.onRenameGroup(target.id, name)
    setRenameGroupTarget(null)
  }

  const handleOpenDelete = (g: WatchGroup, e: MouseEvent) => {
    e.stopPropagation()
    setDeleteGroupTarget(g)
    setMoveToDefaultChecked(true)
  }

  const handleConfirmDelete = async () => {
    const target = deleteGroupTarget()
    if (!target) return
    await props.onDeleteGroup(target.id, moveToDefaultChecked())
    setDeleteGroupTarget(null)
  }

  return (
    <div class="watch-group-tabs-bar">
      {/* 1. 全部视图 */}
      <div
        class="watch-group-tab"
        classList={{ active: props.activeGroupId === ALL_GROUP_ID }}
        onClick={() => props.onSelectGroup(ALL_GROUP_ID)}
      >
        <span>全部</span>
        <span class="tab-count">({props.counts[ALL_GROUP_ID] ?? 0})</span>
      </div>

      {/* 2. 各自定义及默认分组 */}
      <For each={props.groups}>
        {(g) => {
          const isDefault = () => g.id === DEFAULT_GROUP_ID
          const isActive = () => props.activeGroupId === g.id

          return (
            <div
              class="watch-group-tab"
              classList={{ active: isActive() }}
              onClick={() => props.onSelectGroup(g.id)}
            >
              <span>{g.name}</span>
              <span class="tab-count">({props.counts[g.id] ?? 0})</span>

              {/* 编辑与删除操作按钮 */}
              <Show when={!isDefault() && isActive()}>
                <div class="watch-group-tab-actions">
                  <button
                    type="button"
                    class="watch-group-btn-icon"
                    title="重命名分组"
                    onClick={(e) => handleOpenRename(g, e)}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    class="watch-group-btn-icon danger"
                    title="删除分组"
                    onClick={(e) => handleOpenDelete(g, e)}
                  >
                    🗑️
                  </button>
                </div>
              </Show>
            </div>
          )
        }}
      </For>

      {/* 3. 新建分组按钮 */}
      <button
        type="button"
        class="watch-group-tab-add"
        onClick={handleOpenAdd}
        title="新建自选分组"
      >
        ＋ 新建分组
      </button>

      {/* 新建分组弹窗 */}
      <Show when={showAddModal()}>
        <div class="group-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div class="group-modal" onClick={(e) => e.stopPropagation()}>
            <div class="group-modal-title">新建自选分组</div>
            <input
              class="group-modal-input"
              placeholder="请输入分组名称..."
              value={newGroupName()}
              onInput={(e) => setNewGroupName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConfirmAdd()
                if (e.key === 'Escape') setShowAddModal(false)
              }}
              autofocus
            />
            <div class="group-modal-actions">
              <button
                type="button"
                class="group-modal-btn cancel"
                onClick={() => setShowAddModal(false)}
              >
                取消
              </button>
              <button
                type="button"
                class="group-modal-btn confirm"
                onClick={handleConfirmAdd}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 重命名分组弹窗 */}
      <Show when={renameGroupTarget()}>
        <div class="group-modal-backdrop" onClick={() => setRenameGroupTarget(null)}>
          <div class="group-modal" onClick={(e) => e.stopPropagation()}>
            <div class="group-modal-title">重命名分组</div>
            <input
              class="group-modal-input"
              value={renameValue()}
              onInput={(e) => setRenameValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleConfirmRename()
                if (e.key === 'Escape') setRenameGroupTarget(null)
              }}
              autofocus
            />
            <div class="group-modal-actions">
              <button
                type="button"
                class="group-modal-btn cancel"
                onClick={() => setRenameGroupTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                class="group-modal-btn confirm"
                onClick={handleConfirmRename}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* 删除分组确认弹窗 (带保留到默认分组选项) */}
      <Show when={deleteGroupTarget()}>
        <div class="group-modal-backdrop" onClick={() => setDeleteGroupTarget(null)}>
          <div class="group-modal" onClick={(e) => e.stopPropagation()}>
            <div class="group-modal-title">删除分组【{deleteGroupTarget()?.name}】</div>
            <p class="opt-desc" style={{ 'font-size': '11px', margin: '4px 0' }}>
              删除后该分组将不再显示。请选择组内已有股票的处理方式：
            </p>
            <label class="group-tab-modal-checkbox">
              <input
                type="checkbox"
                checked={moveToDefaultChecked()}
                onChange={(e) => setMoveToDefaultChecked(e.currentTarget.checked)}
              />
              <span>将组内股票保留并移入默认分组</span>
            </label>
            <div class="group-modal-actions">
              <button
                type="button"
                class="group-modal-btn cancel"
                onClick={() => setDeleteGroupTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                class="group-modal-btn confirm"
                style={{ background: '#e11d48' }}
                onClick={handleConfirmDelete}
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
