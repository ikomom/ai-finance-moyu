import { createSignal, For, onMount, Show } from 'solid-js'
import './SeatsTab.css'
import type { CustomSeatMapping, SeatCategory } from '../dragon_tiger/types'
import { fetchCustomSeats, saveCustomSeats } from '../../tauri'
import { useSettings } from './SettingsContext'
import {
  groupSeatsToEntities,
  flattenEntitiesToSeats,
  type FocusSeatEntity,
} from './seatEntities'
import { SeatAddBar } from './SeatAddBar'
import { SeatEntityCard } from './SeatEntityCard'

const RADAR_STORAGE_KEY = 'moyu_seat_radar_pool_v2'

const DEFAULT_SEATS: CustomSeatMapping[] = [
  { id: 'preset-hjl-1', branch_keyword: '北京东城分公司', label: '呼家楼', category: 'trader', enabled: true },
  { id: 'preset-hjl-2', branch_keyword: '北京呼家楼', label: '呼家楼', category: 'trader', enabled: true },
  { id: 'preset-lyl-1', branch_keyword: '福州六一中路', label: '六一路', category: 'trader', enabled: true },
  { id: 'preset-zmz-1', branch_keyword: '上海江苏路', label: '章盟主', category: 'trader', enabled: true },
  { id: 'preset-zmz-2', branch_keyword: '杭州延安路', label: '章盟主', category: 'trader', enabled: true },
  { id: 'preset-fxx-1', branch_keyword: '西安朱雀大街', label: '方新侠', category: 'trader', enabled: true },
  { id: 'preset-cxq-1', branch_keyword: '大连黄河路', label: '陈小群', category: 'trader', enabled: true },
  { id: 'preset-gys-1', branch_keyword: '上海宛平南路', label: '炒股养家', category: 'trader', enabled: true },
  { id: 'preset-gys-2', branch_keyword: '上海茅台路', label: '炒股养家', category: 'trader', enabled: true },
  { id: 'preset-inst-1', branch_keyword: '机构专用', label: '机构专用', category: 'institution', enabled: true },
  { id: 'preset-north-1', branch_keyword: '深股通', label: '北向外资', category: 'north', enabled: true },
  { id: 'preset-north-2', branch_keyword: '沪股通', label: '北向外资', category: 'north', enabled: true },
  { id: 'preset-lasa-1', branch_keyword: '拉萨团结路', label: '拉萨天团', category: 'retail', enabled: true },
  { id: 'preset-lasa-2', branch_keyword: '拉萨东环路', label: '拉萨天团', category: 'retail', enabled: true },
]

export function SeatsTab() {
  const { say } = useSettings()
  const [entities, setEntities] = createSignal<FocusSeatEntity[]>([])
  const [filterQuery, setFilterQuery] = createSignal('')
  const [loading, setLoading] = createSignal(true)

  const syncRadarStorage = (currentEntities: FocusSeatEntity[]) => {
    try {
      const radarPool = currentEntities.map((e) => ({
        name: e.name,
        label: e.name,
        active: e.enabled,
      }))
      localStorage.setItem(RADAR_STORAGE_KEY, JSON.stringify(radarPool))
    } catch {
      // Ignore webview localstorage restrictions
    }
  }

  const loadSeats = async () => {
    setLoading(true)
    try {
      const list = await fetchCustomSeats()
      const effectiveList = list && list.length > 0 ? list : DEFAULT_SEATS
      const grouped = groupSeatsToEntities(effectiveList)
      setEntities(grouped)
      syncRadarStorage(grouped)
    } catch {
      say('加载席位配置失败，已取用默认推荐')
      const grouped = groupSeatsToEntities(DEFAULT_SEATS)
      setEntities(grouped)
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    void loadSeats()
  })

  const persistEntities = async (next: FocusSeatEntity[]) => {
    setEntities(next)
    syncRadarStorage(next)
    const flatSeats = flattenEntitiesToSeats(next)
    try {
      await saveCustomSeats(flatSeats)
    } catch {
      say('保存席位配置失败，请重试')
    }
  }

  const handleAddEntity = async (params: {
    name: string
    branchKeywords: string[]
    category: SeatCategory
  }) => {
    const list = entities()
    const existing = list.find((e) => e.name === params.name)
    if (existing) {
      const newBranches = params.branchKeywords.map((kw) => ({
        id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        keyword: kw,
        enabled: true,
      }))
      const next = list.map((e) =>
        e.name === params.name
          ? {
              ...e,
              enabled: true,
              branches: [
                ...e.branches,
                ...newBranches.filter(
                  (nb) => !e.branches.some((ob) => ob.keyword === nb.keyword)
                ),
              ],
            }
          : e
      )
      await persistEntities(next)
      return
    }

    const newEntity: FocusSeatEntity = {
      id: `entity-${Date.now()}`,
      name: params.name,
      category: params.category,
      enabled: true,
      branches: params.branchKeywords.map((kw) => ({
        id: `branch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        keyword: kw,
        enabled: true,
      })),
    }

    await persistEntities([newEntity, ...list])
  }

  const handleToggleEntity = async (name: string) => {
    const next = entities().map((e) =>
      e.name === name ? { ...e, enabled: !e.enabled } : e
    )
    await persistEntities(next)
    say(`已${next.find((e) => e.name === name)?.enabled ? '开启' : '暂停'}【${name}】的监控`)
  }

  const handleChangeCategory = async (name: string, category: SeatCategory) => {
    const next = entities().map((e) =>
      e.name === name ? { ...e, category } : e
    )
    await persistEntities(next)
  }

  const handleDeleteEntity = async (name: string) => {
    const next = entities().filter((e) => e.name !== name)
    await persistEntities(next)
    say(`已从关注池移除【${name}】`)
  }

  const handleAddBranch = async (entityName: string, keyword: string) => {
    const list = entities()
    const target = list.find((e) => e.name === entityName)
    if (!target) return
    if (target.branches.some((b) => b.keyword === keyword)) {
      say('该营业部已关联在当前游资下')
      return
    }
    const newBranch = {
      id: `branch-${Date.now()}`,
      keyword,
      enabled: true,
    }
    const next = list.map((e) =>
      e.name === entityName ? { ...e, branches: [...e.branches, newBranch] } : e
    )
    await persistEntities(next)
    say(`已为【${entityName}】添加营业部：${keyword}`)
  }

  const handleDeleteBranch = async (entityName: string, branchId: string) => {
    const list = entities()
    const target = list.find((e) => e.name === entityName)
    if (!target) return
    if (target.branches.length <= 1) {
      if (!confirm(`【${entityName}】仅剩此一个关联营业部，删除后该游资将被一同移出，确定吗？`)) {
        return
      }
      await handleDeleteEntity(entityName)
      return
    }
    const next = list.map((e) =>
      e.name === entityName
        ? { ...e, branches: e.branches.filter((b) => b.id !== branchId) }
        : e
    )
    await persistEntities(next)
  }

  const handleResetDefaults = async () => {
    if (!confirm('确定恢复官方推荐的核心知名游资与主力关注池吗？')) return
    const grouped = groupSeatsToEntities(DEFAULT_SEATS)
    await persistEntities(grouped)
    say('已恢复官方推荐的席位关注池')
  }

  const filteredEntities = () => {
    const q = filterQuery().trim().toLowerCase()
    if (!q) return entities()
    return entities().filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.branches.some((b) => b.keyword.toLowerCase().includes(q))
    )
  }

  const totalBranchesCount = () =>
    entities().reduce((acc, cur) => acc + cur.branches.length, 0)

  return (
    <div class="seats-tab-container">
      {/* 顶部标题与一键重置 */}
      <div class="seats-toolbar-header">
        <div>
          <div class="seats-tab-heading">🎯 龙虎榜席位与游资关注池</div>
          <div class="seats-tab-subheading">
            统一管理前台「席位雷达」实时扫描目标与龙虎榜明细中的高亮马甲，已关注{' '}
            <span class="seats-stat-highlight">{entities().length}</span> 路主力，覆盖{' '}
            <span class="seats-stat-highlight">{totalBranchesCount()}</span> 个营业部。
          </div>
        </div>
        <button
          type="button"
          class="seats-btn-reset"
          onClick={handleResetDefaults}
          title="一键恢复推荐的知名游资与机构席位"
        >
          ↺ 恢复推荐预设
        </button>
      </div>

      {/* 优雅的一体化搜索添加栏 */}
      <SeatAddBar
        existingNames={entities().map((e) => e.name)}
        onAddEntity={handleAddEntity}
        onSay={say}
      />

      {/* 紧凑的搜索过滤（仅在超过 4 个席位时显示） */}
      <Show when={entities().length > 4}>
        <div class="seats-filter-wrapper">
          <input
            type="text"
            class="seats-input seats-filter-input"
            placeholder="🔍 在已关注席位中过滤…"
            value={filterQuery()}
            onInput={(e) => setFilterQuery(e.currentTarget.value)}
          />
        </div>
      </Show>

      {/* 单列通透席位列表 */}
      <Show
        when={!loading()}
        fallback={<div class="seats-loading-text">加载席位关注池中…</div>}
      >
        <div class="seat-entities-list">
          <For
            each={filteredEntities()}
            fallback={
              <div class="seats-empty-state">
                {filterQuery() ? '未找到匹配的关注席位' : '暂无关注的游资或主力席位，可通过上方搜索框添加'}
              </div>
            }
          >
            {(item) => (
              <SeatEntityCard
                entity={item}
                onToggleEntity={handleToggleEntity}
                onDeleteEntity={handleDeleteEntity}
                onAddBranch={handleAddBranch}
                onDeleteBranch={handleDeleteBranch}
                onChangeCategory={handleChangeCategory}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
