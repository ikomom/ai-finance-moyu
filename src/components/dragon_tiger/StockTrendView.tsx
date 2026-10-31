//! Intraday trend drill-down for one stock, opened from the seat detail list.
//!
//! Complies with AGENTS.md §11 (isolated subcomponent, <=300 lines).

import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import './StockTrendView.css'
import { Chart } from '../Chart'
import { SelectMenu } from '../SelectMenu'
import { fetchStockTrend } from '../../tauri'
import { showToast, snapshot } from '../../store'
import { DEFAULT_GROUP_ID, ALL_GROUP_ID } from '../../services/watchlistGroups'
import type { Trend, TrendPoint, WatchItem } from '../../types'

export interface StockTrendViewProps {
  code: string
  name?: string
  onBack: () => void
  /** Jump the widget itself to this stock (only possible once it is in the watchlist). */
  onOpenInWidget?: (code: string) => void
  /** Hand over to the parent so it can show this stock's own dragon-tiger board. */
  onOpenDragonTiger?: () => void
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

/** `930` -> `09:30`, `1300` -> `13:00`. */
function fmtMinute(t: number): string {
  const s = String(t).padStart(4, '0')
  return `${s.slice(0, 2)}:${s.slice(2)}`
}

export function StockTrendView(props: StockTrendViewProps) {
  const [trend, setTrend] = createSignal<Trend | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [hovered, setHovered] = createSignal<TrendPoint | null>(null)
  const [busy, setBusy] = createSignal(false)

  let lastLoaded = ''

  const snap = () => snapshot()
  const groups = () => snap()?.config.groups ?? [{ id: DEFAULT_GROUP_ID, name: '默认自选' }]
  const watchItem = () =>
    snap()?.config.watchlist.find((w) => w.code.toLowerCase() === props.code.toLowerCase()) ?? null

  const defaultGroupId = () => {
    const active = snap()?.config.activeGroupId
    return active && active !== ALL_GROUP_ID ? active : DEFAULT_GROUP_ID
  }
  const [groupId, setGroupId] = createSignal(defaultGroupId())

  const codeDigits = () => props.code.replace(/^(sh|sz|bj)/i, '')
  const displayName = () => props.name?.trim() || codeDigits()
  const groupName = (id?: string | null) =>
    groups().find((g) => g.id === (id ?? DEFAULT_GROUP_ID))?.name ?? '默认自选'

  const load = async (code: string) => {
    if (!code || code === lastLoaded) return
    lastLoaded = code
    setLoading(true)
    setHovered(null)
    try {
      setTrend(await fetchStockTrend(code))
    } finally {
      setLoading(false)
    }
  }

  createEffect(() => void load(props.code))

  // 分时视图压在席位名单之上，Esc 必须先退回名单，而不是直接关掉整个龙虎榜弹层。
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 分组下拉展开时，Esc 归它自己关菜单，这里不能抢
      if (document.querySelector('[data-select-panel]')) return
      e.stopPropagation()
      props.onBack()
    }
    window.addEventListener('keydown', onKey, true)
    onCleanup(() => window.removeEventListener('keydown', onKey, true))
  })

  const lastPoint = () => {
    const pts = trend()?.points ?? []
    return pts.length > 0 ? pts[pts.length - 1] : null
  }

  const shownPrice = () => hovered()?.price ?? lastPoint()?.price ?? 0
  const preClose = () => trend()?.preClose ?? 0
  const shownPct = () => {
    const base = preClose()
    return base > 0 ? ((shownPrice() - base) / base) * 100 : 0
  }
  const toneClass = () => (shownPct() >= 0 ? 'up' : 'down')

  const addToWatchlist = async () => {
    const s = snap()
    if (!s) return
    if (watchItem()) {
      showToast(`「${displayName()}」已在自选中（${groupName(watchItem()!.group)}）`)
      return
    }
    if (busy()) return

    setBusy(true)
    try {
      const item: WatchItem = {
        code: props.code,
        name: displayName(),
        group: groupId(),
        priceLines: [],
      }
      await invoke('save_config', {
        cfg: { ...s.config, watchlist: [...s.config.watchlist, item] },
      })
      showToast(`已加入自选：${displayName()} · ${groupName(groupId())}`, props.code, displayName())
    } catch (e) {
      showToast(`加入自选失败：${e}`)
    } finally {
      setBusy(false)
    }
  }

  const remindAlreadyAdded = () => {
    const item = watchItem()
    if (!item) return
    showToast(`「${displayName()}」已在自选中（${groupName(item.group)}），去挂件里看就行`)
  }

  return (
    <div class="stock-trend-view">
      {/* 头部：返回 + 标的 + 实时涨跌 */}
      <div class="stv-head">
        <button type="button" class="seat-back-btn" onClick={props.onBack} title="返回席位名单 (Esc)">
          ← 返回
        </button>
        <div class="stv-title">
          <span class="stv-name">{displayName()}</span>
          <span class="stv-code">{codeDigits()}</span>
        </div>
        <div class={`stv-price ${toneClass()}`}>
          <span class="stv-price-val">{shownPrice() > 0 ? shownPrice().toFixed(2) : '--'}</span>
          <span class="stv-price-pct">{fmtPct(shownPct())}</span>
        </div>
      </div>

      <Show
        when={!loading()}
        fallback={<div class="stv-empty">⌛ 正在拉取分时走势…</div>}
      >
        <Show
          when={(trend()?.points.length ?? 0) > 0}
          fallback={<div class="stv-empty">该标的暂无当日分时数据（可能停牌或尚未开盘）</div>}
        >
          <div class="stv-chart">
            <Chart
              trend={trend() ?? undefined}
              preClose={preClose()}
              lastPrice={lastPoint()?.price}
              onHover={(point) => setHovered(point)}
            />
          </div>

          <div class="stv-hover-line">
            <div class="stv-hover-data">
              <Show
                when={hovered()}
                fallback={<span class="stv-hover-idle">昨收 {preClose().toFixed(2)} · 拖动查看每个时点</span>}
              >
                {(p) => (
                  <>
                    <span class="stv-hover-time">{fmtMinute(p().time)}</span>
                    <span class={`stv-hover-price ${toneClass()}`}>{p().price.toFixed(2)}</span>
                    <span class="stv-hover-avg">均价 {p().avgPrice > 0 ? p().avgPrice.toFixed(2) : '--'}</span>
                  </>
                )}
              </Show>
            </div>
            <Show when={props.onOpenDragonTiger}>
              <button type="button" class="stv-link-btn" onClick={() => props.onOpenDragonTiger?.()}>
                🐉 该股龙虎榜 ›
              </button>
            </Show>
          </div>
        </Show>
      </Show>

      {/* 底部操作条：不在自选就加，已加就提示并给挂件入口 */}
      <div class="stv-actions">
        <Show
          when={!watchItem()}
          fallback={
            <>
              <button type="button" class="stv-added-btn" onClick={remindAlreadyAdded}>
                ✓ 已在自选 · {groupName(watchItem()!.group)}
              </button>
              <button
                type="button"
                class="stv-primary-btn"
                onClick={() => props.onOpenInWidget?.(props.code)}
              >
                在挂件中查看 ›
              </button>
            </>
          }
        >
          <SelectMenu
            value={groupId()}
            options={groups().map((g) => ({ value: g.id, label: g.name }))}
            onChange={setGroupId}
            placement="up"
            title="选择要加入的自选分组"
          />
          <button type="button" class="stv-primary-btn" onClick={() => void addToWatchlist()} disabled={busy()}>
            {busy() ? '加入中…' : '＋ 加入自选'}
          </button>
        </Show>
      </div>
    </div>
  )
}
