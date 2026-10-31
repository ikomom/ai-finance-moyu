//! Operating department / famous trader seat drill-down view.
//!
//! Complies with AGENTS.md §11 (isolated subcomponent, <=300 lines).

import { createSignal, For, onMount, Show } from 'solid-js'
import './SeatDetailView.css'
import type { SeatDetailInfo, SeatOperationItem } from './types'
import { fetchSeatDragonTiger } from '../../tauri'
import { cleanBranchName, shortenLhbReason } from './DragonTigerDrawer'
import { StockTrendView } from './StockTrendView'

export interface SeatDetailViewProps {
  branchName: string
  tradeDate?: string
  onBack: () => void
  onSelectStock: (code: string, name?: string) => void
  /** Jump the widget to a stock that is already in the watchlist. */
  onOpenInWidget?: (code: string) => void
}

function fmtMoney(amt: number): string {
  const sign = amt > 0 ? '+' : amt < 0 ? '-' : ''
  const abs = Math.abs(amt)
  if (abs >= 1e8) {
    return `${sign}${(abs / 1e8).toFixed(2)}亿`
  }
  if (abs >= 1e4) {
    return `${sign}${(abs / 1e4).toFixed(0)}万`
  }
  return `${sign}${abs.toFixed(0)}`
}

function getSeatTagClass(label: string): string {
  if (label === '机构专用') return 'institution'
  if (label === '北向外资') return 'north'
  return 'trader'
}

export function SeatDetailView(props: SeatDetailViewProps) {
  const [data, setData] = createSignal<SeatDetailInfo | null>(null)
  const [loading, setLoading] = createSignal(true)
  /** Non-null while the intraday chart of one of this seat's stocks is open. */
  const [trendTarget, setTrendTarget] = createSignal<{ code: string; name: string } | null>(null)

  onMount(async () => {
    try {
      const res = await fetchSeatDragonTiger(props.branchName, props.tradeDate)
      setData(res)
    } finally {
      setLoading(false)
    }
  })

  const openTrend = (op: SeatOperationItem) => setTrendTarget({ code: op.code, name: op.name })

  const renderRow = (op: SeatOperationItem, showDate: boolean) => (
    <div
      class="seat-op-row"
      onClick={() => openTrend(op)}
      title={`查看 ${op.name || op.code} 的当日分时走势，可顺手加入自选`}
    >
      <div class="seat-op-left">
        <Show when={showDate}>
          <span class="seat-op-date">{op.trade_date.slice(5)}</span>
        </Show>
        <span class="seat-op-name">{op.name || op.code.replace(/^(sh|sz|bj)/i, '')}</span>
        <Show when={op.name}>
          <span class="seat-op-code">{op.code.replace(/^(sh|sz|bj)/i, '')}</span>
        </Show>
        <span class="seat-op-reason" title={op.reason}>
          {shortenLhbReason(op.reason)}
        </span>
      </div>

      <div class="seat-op-right">
        <span class={`seat-op-amt ${op.net_amount >= 0 ? 'up' : 'down'}`}>
          {fmtMoney(op.net_amount)}
        </span>
        <span class="seat-op-arrow">›</span>
      </div>
    </div>
  )

  return (
    <Show
      when={trendTarget()}
      fallback={
        <div class="seat-view-container">
          {/* 席位头部与返回栏 */}
          <div class="seat-view-head">
            <button
              type="button"
              class="seat-back-btn"
              onClick={props.onBack}
              title="返回股票龙虎榜 (Esc)"
            >
              ← 返回
            </button>
            <div class="seat-head-title" title={props.branchName}>
              <span class="seat-head-branch">{cleanBranchName(props.branchName)}</span>
              <Show when={data()?.trader_label}>
                {(tag) => (
                  <span class={`lhb-seat-tag ${getSeatTagClass(tag())}`}>{tag()}</span>
                )}
              </Show>
            </div>
          </div>

          {/* 列表内容区 */}
          <Show
            when={!loading()}
            fallback={
              <div class="lhb-empty-card">
                <span>⌛ 正在拉取该席位操盘战绩…</span>
              </div>
            }
          >
            <div class="seat-view-scroll">
              {/* 1. 同日联动买入 */}
              <Show when={(data()?.same_day_operations.length ?? 0) > 0}>
                <div class="seat-section-title">
                  <span>⚡ 同日联动操盘 ({props.tradeDate ?? '最新披露日'})</span>
                </div>
                <div class="seat-op-list">
                  <For each={data()!.same_day_operations}>{(op) => renderRow(op, false)}</For>
                </div>
              </Show>

              {/* 2. 近 1 个月历史活跃战绩 */}
              <div class="seat-section-title" style={{ 'margin-top': '8px' }}>
                <span>📅 近期龙虎榜战绩</span>
              </div>
              <Show
                when={(data()?.historical_operations.length ?? 0) > 0}
                fallback={
                  <div class="seat-empty-hint">
                    <span>该席位近期暂无更多公开上榜交易</span>
                  </div>
                }
              >
                <div class="seat-op-list">
                  <For each={data()!.historical_operations}>{(op) => renderRow(op, true)}</For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      }
    >
      {(target) => (
        <StockTrendView
          code={target().code}
          name={target().name}
          onBack={() => setTrendTarget(null)}
          onOpenInWidget={props.onOpenInWidget}
          onOpenDragonTiger={() => {
            const t = target()
            setTrendTarget(null)
            props.onSelectStock(t.code, t.name)
          }}
        />
      )}
    </Show>
  )
}
