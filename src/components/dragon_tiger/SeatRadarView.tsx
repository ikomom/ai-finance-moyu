import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import './SeatRadarView.css'
import type { SeatRadarItem } from './types'
import { fetchSeatRadar } from '../../tauri'
import { fmtPct, fmtPrice, trendClass } from '../../types'
import { searchBranchDictionary, resolveSeatLabel, type BranchDictItem } from './seatDict'

export interface SeatRadarViewProps {
  onOpenDrawer?: (code: string, name?: string, highlightBranch?: string) => void
}

export interface SeatWatchItem {
  name: string
  label?: string
  active: boolean
}

const STORAGE_KEY = 'moyu_seat_radar_pool_v2'

const DEFAULT_SEATS: SeatWatchItem[] = [
  { name: '六一路', label: '六一路', active: true },
  { name: '呼家楼', label: '呼家楼', active: true },
  { name: '章盟主', label: '章盟主', active: true },
  { name: '方新侠', label: '方新侠', active: true },
  { name: '陈小群', label: '陈小群', active: true },
  { name: '机构专用', label: '机构专用', active: true },
]

function fmtAmount(amt: number): string {
  const abs = Math.abs(amt)
  const sign = amt > 0 ? '+' : amt < 0 ? '-' : ''
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}万`
  return `${sign}${abs.toFixed(0)}`
}

function cleanShortName(name: string, label?: string): string {
  if (label) return label
  return name
    .replace(/股份有限公司/g, '')
    .replace(/有限责任公司/g, '')
    .replace(/证券营业部/g, '')
    .trim() || name
}

export function SeatRadarView(props: SeatRadarViewProps) {
  // 从本地持久化初始化关注席位池
  const [seatPool, setSeatPool] = createSignal<SeatWatchItem[]>((() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // 兼容旧版 string[] 迁移到 SeatWatchItem[]
          if (typeof parsed[0] === 'string') {
            return (parsed as string[]).map((s) => ({
              name: s,
              label: s,
              active: true,
            }))
          }
          return parsed as SeatWatchItem[]
        }
      }
    } catch (_) {}
    return DEFAULT_SEATS
  })())

  const [searchQuery, setSearchQuery] = createSignal('')
  const [isSuggestOpen, setIsSuggestOpen] = createSignal(false)
  const [tradeDate, setTradeDate] = createSignal('')
  const [direction, setDirection] = createSignal<'all' | 'buy' | 'sell'>('all')
  const [loading, setLoading] = createSignal(false)
  const [currentQueryDate, setCurrentQueryDate] = createSignal('')
  const [items, setItems] = createSignal<SeatRadarItem[]>([])

  const savePool = (pool: SeatWatchItem[]) => {
    setSeatPool(pool)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pool))
    } catch (_) {}
  }

  const toggleSeatActive = (name: string) => {
    const next = seatPool().map((item) =>
      item.name === name ? { ...item, active: !item.active } : item
    )
    savePool(next)
    void doQuery()
  }

  const removeSeat = (name: string, e: MouseEvent) => {
    e.stopPropagation()
    const next = seatPool().filter((item) => item.name !== name)
    savePool(next)
    void doQuery()
  }

  const restoreDefaults = () => {
    savePool(DEFAULT_SEATS)
    void doQuery()
  }

  const addSeatToPool = (branchName: string, label?: string) => {
    const clean = branchName.trim()
    if (!clean) return
    const cur = seatPool()
    const existingIndex = cur.findIndex((item) => item.name === clean)
    if (existingIndex >= 0) {
      // 若已在池中，确保将其激活
      const updated = [...cur]
      updated[existingIndex].active = true
      savePool(updated)
    } else {
      savePool([...cur, { name: clean, label, active: true }])
    }
    setSearchQuery('')
    setIsSuggestOpen(false)
    void doQuery()
  }

  // 联想建议列表
  const suggestions = () => searchBranchDictionary(searchQuery())

  const doQuery = async () => {
    const activeBranches = seatPool()
      .filter((s) => s.active)
      .map((s) => s.name)

    if (activeBranches.length === 0) {
      setItems([])
      return
    }

    setLoading(true)
    try {
      const res = await fetchSeatRadar(activeBranches, tradeDate() || undefined)
      if (res) {
        setCurrentQueryDate(res.query_date)
        setItems(res.items || [])
      }
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    void doQuery()
  })

  // 点击外部关闭搜索下拉
  const handleWindowClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.seat-input-container')) {
      setIsSuggestOpen(false)
    }
  }

  onMount(() => {
    window.addEventListener('click', handleWindowClick)
  })
  onCleanup(() => {
    window.removeEventListener('click', handleWindowClick)
  })

  const filteredItems = () => {
    const dir = direction()
    return items().filter((item) => {
      if (dir === 'buy') return item.is_buy
      if (dir === 'sell') return !item.is_buy
      return true
    })
  }

  return (
    <div class="seat-radar-wrap">
      {/* 席位配置条 */}
      <div class="seat-radar-bar">
        <div class="seat-radar-title" style={{ "justify-content": "space-between" }}>
          <span>🎯 关注席位池 ({seatPool().filter((s) => s.active).length}/{seatPool().length} 生效)</span>
          <Show when={seatPool().length === 0}>
            <button
              type="button"
              class="seat-action-btn"
              style={{ "font-size": "9px", padding: "1px 6px" }}
              onClick={restoreDefaults}
            >
              恢复推荐游资
            </button>
          </Show>
        </div>

        {/* 关注席位池胶囊列表（包含所有已添加的营业部，支持点击开关与点击 × 删除） */}
        <div class="seat-capsules-grid">
          <For each={seatPool()}>
            {(seat) => (
              <span
                class={`seat-capsule-btn ${seat.active ? 'active' : ''}`}
                onClick={() => toggleSeatActive(seat.name)}
                title={`点击切换开启/关闭；点右侧 × 删除（${seat.name}）`}
              >
                <span>{cleanShortName(seat.name, seat.label)}</span>
                <span
                  class="seat-capsule-del"
                  onClick={(e) => removeSeat(seat.name, e)}
                  title="从关注池中删除"
                >
                  ×
                </span>
              </span>
            )}
          </For>
        </div>

        {/* 智能搜索与添加输入框 (带实时联想下拉浮层) */}
        <div class="seat-input-container">
          <div class="seat-input-row">
            <input
              type="text"
              class="seat-custom-input"
              placeholder="搜索营业部或游资（如：六一、呼家、拉萨、江苏路…）"
              value={searchQuery()}
              onInput={(e) => {
                setSearchQuery(e.currentTarget.value)
                setIsSuggestOpen(e.currentTarget.value.trim().length > 0)
              }}
              onFocus={() => {
                if (searchQuery().trim().length > 0) setIsSuggestOpen(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const s = suggestions()
                  if (s.length > 0) {
                    addSeatToPool(s[0].branchName, s[0].traderLabel)
                  } else if (searchQuery().trim()) {
                    addSeatToPool(searchQuery().trim())
                  }
                } else if (e.key === 'Escape') {
                  setIsSuggestOpen(false)
                }
              }}
            />
            <button
              type="button"
              class="seat-action-btn"
              onClick={() => {
                const s = suggestions()
                if (s.length > 0) {
                  addSeatToPool(s[0].branchName, s[0].traderLabel)
                } else if (searchQuery().trim()) {
                  addSeatToPool(searchQuery().trim())
                }
              }}
            >
              + 添加
            </button>
          </div>

          {/* 实时搜索下拉联想菜单 */}
          <Show when={isSuggestOpen() && searchQuery().trim().length > 0}>
            <div class="seat-suggest-menu">
              <For each={suggestions()}>
                {(item: BranchDictItem) => {
                  const isAdded = () =>
                    seatPool().some((s) => s.name === item.branchName)
                  return (
                    <div
                      class="seat-suggest-item"
                      onClick={() => addSeatToPool(item.branchName, item.traderLabel)}
                      title={item.branchName}
                    >
                      <div class="seat-suggest-left">
                        <Show when={item.traderLabel}>
                          <span class="seat-suggest-tag">{item.traderLabel}</span>
                        </Show>
                        <span class="seat-suggest-name">{item.branchName}</span>
                      </div>
                      <button
                        type="button"
                        class={`seat-suggest-btn ${isAdded() ? 'added' : ''}`}
                      >
                        {isAdded() ? '已关注' : '+ 关注'}
                      </button>
                    </div>
                  )
                }}
              </For>
              <Show when={suggestions().length === 0}>
                <div
                  class="seat-suggest-item"
                  onClick={() => addSeatToPool(searchQuery().trim())}
                >
                  <span class="seat-suggest-name" style={{ color: '#38bdf8' }}>
                    ＋ 将 "{searchQuery().trim()}" 作为自定义营业部添加
                  </span>
                </div>
              </Show>
            </div>
          </Show>
        </div>

        {/* 过滤控制栏 (日期 + 方向切换 + 刷新按钮) */}
        <div class="seat-filter-controls">
          <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
            <span style={{ color: '#64748b', 'font-size': '10px' }}>日期:</span>
            <input
              type="date"
              class="seat-date-input"
              value={tradeDate()}
              onChange={(e) => {
                setTradeDate(e.currentTarget.value)
                void doQuery()
              }}
              title="留空则自动查询最新披露日"
            />
          </div>

          <div class="seat-dir-tabs">
            <button
              type="button"
              class={`seat-dir-btn ${direction() === 'all' ? 'active' : ''}`}
              onClick={() => setDirection('all')}
            >
              全部
            </button>
            <button
              type="button"
              class={`seat-dir-btn ${direction() === 'buy' ? 'active' : ''}`}
              onClick={() => setDirection('buy')}
            >
              买入
            </button>
            <button
              type="button"
              class={`seat-dir-btn ${direction() === 'sell' ? 'active' : ''}`}
              onClick={() => setDirection('sell')}
            >
              卖出
            </button>
          </div>

          <button
            type="button"
            class="seat-action-btn"
            style={{ background: '#0284c7' }}
            onClick={() => void doQuery()}
          >
            ⚡ 筛选
          </button>
        </div>
      </div>

      {/* 披露日提示栏 */}
      <Show when={currentQueryDate()}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', color: '#64748b', 'font-size': '10px', 'padding': '0 2px' }}>
          <span>披露日: {currentQueryDate()}</span>
          <span>命中标目: {filteredItems().length} 只</span>
        </div>
      </Show>

      {/* 结果列表 */}
      <Show
        when={!loading()}
        fallback={<div class="seat-empty-hint">⌛ 正在全网筛选匹配营业部席位…</div>}
      >
        <div class="seat-results-list">
          <For
            each={filteredItems()}
            fallback={
              <div class="seat-empty-hint">
                <span>该交易日关注席位未出现在龙虎榜买卖前五中</span>
                <div style={{ 'margin-top': '4px', color: '#475569' }}>
                  可尝试切换日期或搜索添加更多营业部
                </div>
              </div>
            }
          >
            {(item: SeatRadarItem) => (
              <div
                class="seat-result-card"
                onClick={() =>
                  props.onOpenDrawer?.(item.code, item.name || item.code, item.branch_name)
                }
                title={`点击查看 ${item.name || item.code} 龙虎榜席位详情（高亮该营业部）`}
              >
                <div class="seat-res-top">
                  <div class="seat-res-stock">
                    <span class="seat-res-name">{item.name || item.code}</span>
                    <span class="seat-res-code">{item.code}</span>
                  </div>
                  <div class="seat-res-quote">
                    <span class={`seat-res-price ${trendClass(item.change_pct)}`}>
                      {fmtPrice(item.close_price, 2)}
                    </span>
                    <span class={`seat-res-pct ${trendClass(item.change_pct)}`}>
                      {fmtPct(item.change_pct)}
                    </span>
                  </div>
                </div>

                <div class="seat-res-bottom">
                  <div class="seat-hit-badge" title={item.branch_name}>
                    <Show when={resolveSeatLabel(item.branch_name, item.trader_label)}>
                      {(tag) => <span class="seat-trader-tag">{tag().label}</span>}
                    </Show>
                    <span>{cleanShortName(item.branch_name)}</span>
                  </div>
                  <div class={`seat-action-val ${item.is_buy ? 'buy' : 'sell'}`}>
                    <span>{item.is_buy ? '买入' : '卖出'}</span>
                    <span>{fmtAmount(item.is_buy ? item.buy_amount : item.sell_amount)}</span>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
