import { createSignal, For, onMount, Show } from 'solid-js'
import './SeatRadarView.css'
import type { SeatRadarItem } from './types'
import { fetchSeatRadar } from '../../tauri'
import { alignToTradeDay } from './utils'
import { SeatRadarCard } from './SeatRadarCard'
import { SeatPoolBar } from './SeatPoolBar'

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

  const removeSeat = (name: string) => {
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
    void doQuery()
  }

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
      <SeatPoolBar
        seatPool={seatPool()}
        onToggleActive={toggleSeatActive}
        onRemoveSeat={removeSeat}
        onAddSeat={addSeatToPool}
        onRestoreDefaults={restoreDefaults}
      />

        {/* 过滤控制栏 (日期 + 方向切换 + 刷新按钮) */}
        <div class="seat-filter-controls">
          <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
            <span style={{ color: 'var(--text-muted)', 'font-size': '10px' }}>日期:</span>
            <input
              type="date"
              class="seat-date-input"
              value={tradeDate()}
              onChange={(e) => {
                const aligned = alignToTradeDay(e.currentTarget.value)
                setTradeDate(aligned)
                void doQuery()
              }}
              title="选择日期（周末自动对齐最近交易日，留空则自动查询最新）"
            />
            <Show when={tradeDate()}>
              <button
                type="button"
                class="seat-dir-btn"
                style={{ padding: '2px 5px', 'font-size': '9.5px', height: '20px' }}
                onClick={() => {
                  setTradeDate('')
                  void doQuery()
                }}
                title="切回最新披露交易日"
              >
                最新
              </button>
            </Show>
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

      {/* 披露日提示栏 */}
      <Show when={currentQueryDate()}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', color: 'var(--text-muted)', 'font-size': '10px', 'padding': '0 2px' }}>
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
              <SeatRadarCard item={item} onOpenDrawer={props.onOpenDrawer} />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
