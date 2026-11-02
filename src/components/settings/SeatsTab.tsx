import { createSignal, For, onMount, Show } from 'solid-js'
import './SeatsTab.css'
import type { CustomSeatMapping, SeatCategory } from '../dragon_tiger/types'
import { fetchCustomSeats, saveCustomSeats } from '../../tauri'
import { useSettings } from './SettingsContext'

const CATEGORIES: { id: SeatCategory; label: string }[] = [
  { id: 'trader', label: '游资' },
  { id: 'institution', label: '机构' },
  { id: 'north', label: '外资' },
  { id: 'quant', label: '量化' },
  { id: 'custom', label: '自定义' },
]

export function SeatsTab() {
  const { say } = useSettings()
  const [seats, setSeats] = createSignal<CustomSeatMapping[]>([])
  const [search, setSearch] = createSignal('')
  const [keyword, setKeyword] = createSignal('')
  const [label, setLabel] = createSignal('')
  const [category, setCategory] = createSignal<SeatCategory>('trader')
  const [loading, setLoading] = createSignal(true)

  const loadSeats = async () => {
    setLoading(true)
    const list = await fetchCustomSeats()
    setSeats(list)
    setLoading(false)
  }

  onMount(() => {
    void loadSeats()
  })

  const persist = async (next: CustomSeatMapping[]) => {
    setSeats(next)
    try {
      await saveCustomSeats(next)
      say('席位标记已保存并全链路生效')
    } catch {
      say('保存席位标记失败，请重试')
    }
  }

  const handleAdd = async () => {
    const kw = keyword().trim()
    const lbl = label().trim()
    if (!kw || !lbl) {
      say('请完整填写营业部关键词与标签名')
      return
    }

    const newItem: CustomSeatMapping = {
      id: `custom-${Date.now()}`,
      branch_keyword: kw,
      label: lbl,
      category: category(),
      enabled: true,
    }

    const next = [newItem, ...seats().filter((s) => s.branch_keyword !== kw)]
    setKeyword('')
    setLabel('')
    await persist(next)
  }

  const handleToggle = async (id: string) => {
    const next = seats().map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    await persist(next)
  }

  const handleDelete = async (id: string) => {
    const next = seats().filter((s) => s.id !== id)
    await persist(next)
  }

  const handleResetDefaults = async () => {
    if (!confirm('确定恢复官方推荐的知名游资与机构席位标记预设吗？')) return
    const defSeats: CustomSeatMapping[] = [
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
      { id: 'preset-lasa-1', branch_keyword: '拉萨团结路', label: '拉萨天团', category: 'trader', enabled: true },
      { id: 'preset-lasa-2', branch_keyword: '拉萨东环路', label: '拉萨天团', category: 'trader', enabled: true },
    ]
    await persist(defSeats)
  }

  const filteredSeats = () => {
    const q = search().trim().toLowerCase()
    if (!q) return seats()
    return seats().filter(
      (s) =>
        s.branch_keyword.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    )
  }

  return (
    <div class="seats-tab-container">
      {/* 顶部新增卡片 */}
      <div class="seats-add-card">
        <div style={{ 'font-size': '13px', 'font-weight': '600', color: '#e2e8f0' }}>
          ✨ 标记自定义游资或机构席位
        </div>
        <div style={{ 'font-size': '11px', color: '#94a3b8' }}>
          设置后将在龙虎榜买卖前五席位、席位雷达及战绩下钻中全链路自动识别并着色显示。
        </div>

        <div class="seats-form-row">
          <input
            type="text"
            class="seats-input"
            placeholder="营业部关键词/全称 (如：中信建投北京东城分公司、拉萨东环路)"
            value={keyword()}
            onInput={(e) => setKeyword(e.currentTarget.value)}
          />
          <input
            type="text"
            class="seats-input"
            style={{ 'max-width': '130px' }}
            placeholder="自定义标签名 (如：呼家楼)"
            value={label()}
            onInput={(e) => setLabel(e.currentTarget.value)}
          />
        </div>

        <div class="seats-form-row" style={{ 'justify-content': 'space-between' }}>
          <div class="seats-cat-picker">
            <For each={CATEGORIES}>
              {(cat) => (
                <button
                  type="button"
                  class={`seats-cat-btn ${cat.id} ${category() === cat.id ? 'active' : ''}`}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                </button>
              )}
            </For>
          </div>
          <button type="button" class="seats-add-btn" onClick={handleAdd}>
            ＋ 添加席位标记
          </button>
        </div>
      </div>

      {/* 列表管理工具栏 */}
      <div class="seats-header-toolbar">
        <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
          <input
            type="text"
            class="seats-input"
            style={{ width: '180px', padding: '3px 8px', 'font-size': '11px' }}
            placeholder="🔍 搜索已标记规则…"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <span>
            共 {seats().length} 条（已启用 {seats().filter((s) => s.enabled).length} 条）
          </span>
        </div>
        <button type="button" class="seats-btn-reset" onClick={handleResetDefaults}>
          ↺ 恢复推荐预设
        </button>
      </div>

      {/* 席位规则列表 */}
      <Show when={!loading()} fallback={<div style={{ color: '#64748b', 'font-size': '12px' }}>载入中…</div>}>
        <div class="seats-list">
          <For
            each={filteredSeats()}
            fallback={
              <div style={{ color: '#64748b', 'font-size': '12px', 'text-align': 'center', padding: '20px 0' }}>
                暂无匹配的席位标记规则
              </div>
            }
          >
            {(item) => (
              <div class="seats-item-row" style={{ opacity: item.enabled ? '1' : '0.45' }}>
                <div class="seats-item-left">
                  <span class={`seat-badge-pill ${item.category}`}>{item.label}</span>
                  <span class="seat-keyword-text" title={item.branch_keyword}>
                    {item.branch_keyword}
                  </span>
                </div>
                <div class="seats-item-right">
                  <button
                    type="button"
                    class="seats-toggle-btn"
                    onClick={() => handleToggle(item.id)}
                    title={item.enabled ? '点击禁用该规则' : '点击启用该规则'}
                  >
                    {item.enabled ? '🟢' : '⚪'}
                  </button>
                  <button
                    type="button"
                    class="seats-del-btn"
                    onClick={() => handleDelete(item.id)}
                    title="删除该规则"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
