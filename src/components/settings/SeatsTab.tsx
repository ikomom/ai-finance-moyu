import { createSignal, For, onMount, Show } from 'solid-js'
import './SeatsTab.css'
import type { CustomSeatMapping, SeatCategory } from '../dragon_tiger/types'
import { fetchCustomSeats, saveCustomSeats } from '../../tauri'
import { useSettings } from './SettingsContext'

const RADAR_STORAGE_KEY = 'moyu_seat_radar_pool_v2'

const CATEGORIES: { id: SeatCategory; label: string }[] = [
  { id: 'trader', label: '游资' },
  { id: 'institution', label: '机构' },
  { id: 'north', label: '外资' },
  { id: 'quant', label: '量化' },
  { id: 'custom', label: '自定义' },
]

import { POPULAR_TRADERS, type PopularTraderPreset } from './popularTraders'

export function SeatsTab() {
  const { say } = useSettings()
  const [seats, setSeats] = createSignal<CustomSeatMapping[]>([])
  const [showAdvanced, setShowAdvanced] = createSignal(false)
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
      say('游资追踪与席位配置已更新生效')
    } catch {
      say('保存席位配置失败，请重试')
    }
  }

  const isTraderActive = (trader: PopularTraderPreset) => {
    const list = seats()
    return trader.branchKeywords.some((kw) => {
      const match = list.find((s) => s.branch_keyword.includes(kw) || kw.includes(s.branch_keyword))
      return match ? match.enabled : true
    })
  }

  const toggleTrader = async (trader: PopularTraderPreset) => {
    const active = isTraderActive(trader)
    const nextState = !active
    const list = seats()
    let updated = [...list]

    for (const kw of trader.branchKeywords) {
      const idx = updated.findIndex((s) => s.branch_keyword.includes(kw) || kw.includes(s.branch_keyword))
      if (idx >= 0) {
        updated[idx] = { ...updated[idx], enabled: nextState }
      } else if (nextState) {
        updated.unshift({
          id: `preset-${Date.now()}-${kw}`,
          branch_keyword: kw,
          label: trader.name,
          category: trader.category,
          enabled: true,
        })
      }
    }

    try {
      const saved = localStorage.getItem(RADAR_STORAGE_KEY)
      const radarPool: Array<{ name: string; label?: string; active: boolean }> = saved ? JSON.parse(saved) : []
      const existing = radarPool.find((item) => item.name === trader.name)
      if (existing) {
        existing.active = nextState
      } else {
        radarPool.push({ name: trader.name, label: trader.name, active: nextState })
      }
      localStorage.setItem(RADAR_STORAGE_KEY, JSON.stringify(radarPool))
    } catch {
      // Ignore localstorage errors in restricted webview
    }

    await persist(updated)
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
    if (!confirm('确定恢复官方推荐的知名游资与主力席位预设吗？')) return
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
      {/* 1. 核心游资雷达关注池 */}
      <div class="seats-add-card">
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
          <div>
            <div style={{ 'font-size': '13px', 'font-weight': '600', color: '#e2e8f0' }}>
              🎯 核心知名游资与主力关注池
            </div>
            <div style={{ 'font-size': '11px', color: '#94a3b8', 'margin-top': '2px' }}>
              勾选关注的主力席位，前台「席位雷达」与「大盘游资动向」将自动进行全市场实时扫描与高亮。
            </div>
          </div>
          <button type="button" class="seats-btn-reset" onClick={handleResetDefaults} title="恢复官方推荐的预设游资配置">
            ↺ 恢复推荐预设
          </button>
        </div>

        <div class="popular-traders-grid">
          <For each={POPULAR_TRADERS}>
            {(trader) => {
              const active = () => isTraderActive(trader)
              return (
                <div
                  class={`popular-trader-card ${active() ? 'active' : ''}`}
                  onClick={() => toggleTrader(trader)}
                  title={`点击${active() ? '取消关注' : '加入关注'} ${trader.name}`}
                >
                  <div class="popular-trader-top">
                    <span class="popular-trader-name">{trader.name}</span>
                    <span class={`seat-badge-pill ${trader.category}`} style={{ 'font-size': '10px' }}>
                      {active() ? '已关注' : '未开启'}
                    </span>
                  </div>
                  <span class="popular-trader-desc">{trader.desc}</span>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* 2. 高级：自定义营业部标签映射（默认折叠） */}
      <div class="seats-adv-toggle" onClick={() => setShowAdvanced(!showAdvanced())}>
        <span>{showAdvanced() ? '▼' : '▶'}</span>
        <span>高级设置：自定义营业部标签与马甲映射 ({seats().length} 条规则)</span>
      </div>

      <Show when={showAdvanced()}>
        <div class="seats-add-card" style={{ 'border-style': 'dashed' }}>
          <div style={{ 'font-size': '12px', 'font-weight': '600', color: '#cbd5e1' }}>
            ➕ 新增营业部识别规则
          </div>
          <div class="seats-form-row">
            <input
              type="text"
              class="seats-input"
              placeholder="营业部关键词/全称 (如：中信证券北京东城分公司)"
              value={keyword()}
              onInput={(e) => setKeyword(e.currentTarget.value)}
            />
            <input
              type="text"
              class="seats-input"
              style={{ 'max-width': '130px' }}
              placeholder="标签名 (如：呼家楼)"
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
              ＋ 添加规则
            </button>
          </div>

          {/* 列表搜索与表格 */}
          <div class="seats-header-toolbar" style={{ 'margin-top': '8px' }}>
            <input
              type="text"
              class="seats-input"
              style={{ width: '180px', padding: '3px 8px', 'font-size': '11px' }}
              placeholder="🔍 搜索规则…"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
          </div>

          <Show when={!loading()} fallback={<div style={{ color: '#64748b', 'font-size': '11px', padding: '10px' }}>加载席位规则中…</div>}>
            <div class="seats-list" style={{ 'max-height': '240px' }}>
              <For each={filteredSeats()}>
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
      </Show>
    </div>
  )
}
