import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import './DragonTigerDrawer.css'
import type { DragonTigerSeat, StockDetailInfo } from './types'
import { fetchStockDragonTiger } from '../../tauri'
import { navigateToStock } from '../../store'
import { SeatDetailView } from './SeatDetailView'
import { SeatRow } from './SeatRow'
import {
  fmtMoney,
  cleanBranchName,
  getLhbPeriodType,
  getDaysDiff,
  shortenLhbReason,
  trendMoneyClass,
  analyzeSeatPairs,
} from './utils'

export { cleanBranchName, getLhbPeriodType, getDaysDiff, shortenLhbReason, fmtMoney, trendMoneyClass }

export interface DragonTigerDrawerProps {
  code: string
  name?: string
  highlightBranch?: string
  onClose: () => void
}

export function DragonTigerDrawer(props: DragonTigerDrawerProps) {
  const [currentCode, setCurrentCode] = createSignal(props.code)
  const [currentName, setCurrentName] = createSignal(props.name)
  const [highlightBranch, setHighlightBranch] = createSignal(props.highlightBranch)
  const [hoveredPairId, setHoveredPairId] = createSignal<string | null>(null)
  const [selectedSeat, setSelectedSeat] = createSignal<{ branchName: string; tradeDate?: string } | null>(null)

  const [data, setData] = createSignal<StockDetailInfo | null>(null)
  const [loading, setLoading] = createSignal(true)

  createEffect(() => {
    setCurrentCode(props.code)
    setCurrentName(props.name)
    setHighlightBranch(props.highlightBranch)
  })

  let lastLoadedCode = ''
  const loadData = async (code: string) => {
    if (!code || code === lastLoadedCode) return
    lastLoadedCode = code
    setLoading(true)
    try {
      const res = await fetchStockDragonTiger(code)
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedSeat()) {
          setSelectedSeat(null)
        } else {
          props.onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    onCleanup(() => window.removeEventListener('keydown', handleKey))
  })

  createEffect(() => {
    const c = currentCode()
    if (c) void loadData(c)
  })

  const dt = () => data()?.dragon_tiger

  return (
    <div
      class="lhb-drawer-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          selectedSeat() ? setSelectedSeat(null) : props.onClose()
        }
      }}
    >
      <div class="lhb-drawer-container">
        {/* Header */}
        <div class="lhb-drawer-header">
          <div class="lhb-drawer-title">
            <span class="lhb-title-name">{currentName() ?? currentCode()}</span>
            <span class="lhb-title-code">{currentCode()}</span>
            <span class="lhb-badge-title-tag">🐉 龙虎榜席位</span>
          </div>
          <button type="button" class="lhb-close-btn" onClick={props.onClose} title="关闭 (Esc)">
            ✕
          </button>
        </div>

        {/* Content body */}
        <Show
          when={!selectedSeat()}
          fallback={
            <SeatDetailView
              branchName={selectedSeat()!.branchName}
              tradeDate={selectedSeat()!.tradeDate}
              onBack={() => setSelectedSeat(null)}
              onSelectStock={(code, name) => {
                const seatToHighlight = selectedSeat()?.branchName
                setSelectedSeat(null)
                if (seatToHighlight) setHighlightBranch(seatToHighlight)
                setCurrentCode(code)
                setCurrentName(name)
                lastLoadedCode = ''
                void loadData(code)
              }}
              onOpenInWidget={(code) => { navigateToStock(code); props.onClose(); }}
            />
          }
        >
          <Show
            when={!loading()}
            fallback={<div class="lhb-empty-card"><span>⌛ 正在拉取龙虎榜席位数据…</span></div>}
          >
            <div class="lhb-drawer-content">
              <Show
                when={dt()}
                fallback={
                  <div class="lhb-empty-card">
                    <span>该标的近期未披露龙虎榜席位数据</span>
                    <span style={{ "font-size": "10px", color: "#475569" }}>
                      （多为正常市场波动，未触及交易所异动披露条件）
                    </span>
                  </div>
                }
              >
                {(l) => (
                  <>
                    <div class="lhb-summary-card">
                      <div class="lhb-summary-header">
                        <div style={{ display: "flex", "align-items": "center", gap: "4px", "max-width": "68%" }}>
                          <span
                            class={`lhb-period-badge ${getLhbPeriodType(l().reason) === '3day' ? 'cumulative' : ''}`}
                          >
                            {getLhbPeriodType(l().reason) === '3day' ? '3日累计' : '单日榜'}
                          </span>
                          <span class="lhb-reason-tag" title={l().reason}>
                            ⚡ {shortenLhbReason(l().reason)}
                          </span>
                        </div>
                        <Show
                          when={getDaysDiff(l().trade_date) > 5}
                          fallback={<span class="lhb-date-tag">上榜日 {l().trade_date}</span>}
                        >
                          <span
                            class="lhb-date-tag is-stale"
                            title={`该标的近期未触发异动披露，此为历史最后一次上榜记录（距今已超 ${getDaysDiff(l().trade_date)} 天）`}
                          >
                            ⚠️ 历史复盘 {l().trade_date}
                          </span>
                        </Show>
                      </div>

                      <div class="lhb-stat-grid">
                        <div class="lhb-stat-box">
                          <span class="lhb-stat-lbl">
                            {getLhbPeriodType(l().reason) === '3day' ? '3日总净买' : '单日总净买'}
                          </span>
                          <span class={`lhb-stat-val ${trendMoneyClass(l().net_total)}`}>
                            {fmtMoney(l().net_total)}
                          </span>
                        </div>
                        <div class="lhb-stat-box">
                          <span class="lhb-stat-lbl">机构净参与</span>
                          <span class={`lhb-stat-val ${trendMoneyClass(l().institution_net)}`}>
                            {l().institution_net === 0 ? '0' : fmtMoney(l().institution_net)}
                          </span>
                        </div>
                        <Show when={l().close_price > 0}>
                          <div class="lhb-stat-box">
                            <span class="lhb-stat-lbl">当日收盘</span>
                            <span class={`lhb-stat-val ${l().change_pct > 0 ? 'up' : l().change_pct < 0 ? 'down' : 'flat'}`}>
                              {l().close_price.toFixed(2)}
                              <span class="lhb-stat-pct">
                                {l().change_pct >= 0 ? '+' : ''}
                                {l().change_pct.toFixed(2)}%
                              </span>
                            </span>
                          </div>
                        </Show>
                      </div>
                    </div>

                    {(() => {
                      const pairs = () => analyzeSeatPairs(l().top_buyers, l().top_sellers)
                      return (
                        <>
                          <div class="lhb-section-header buy">
                            <span>🔺 买入前五席位</span>
                          </div>
                          <div class="lhb-seat-list">
                            <For each={l().top_buyers}>
                              {(seat: DragonTigerSeat, idx) => (
                                <SeatRow
                                  idx={idx()}
                                  seat={seat}
                                  meta={pairs().buyerMetas[idx()]}
                                  isBuy={true}
                                  highlightBranch={highlightBranch()}
                                  hoveredPairId={hoveredPairId()}
                                  onHover={setHoveredPairId}
                                  onClick={() => setSelectedSeat({ branchName: seat.branch_name, tradeDate: l().trade_date })}
                                />
                              )}
                            </For>
                          </div>

                          <Show when={l().top_sellers.length > 0}>
                            <div class="lhb-section-header sell" style={{ "margin-top": "8px" }}>
                              <span>🔻 卖出前五席位</span>
                            </div>
                            <div class="lhb-seat-list">
                              <For each={l().top_sellers}>
                                {(seat: DragonTigerSeat, idx) => (
                                  <SeatRow
                                    idx={idx()}
                                    seat={seat}
                                    meta={pairs().sellerMetas[idx()]}
                                    isBuy={false}
                                    highlightBranch={highlightBranch()}
                                    hoveredPairId={hoveredPairId()}
                                    onHover={setHoveredPairId}
                                    onClick={() => setSelectedSeat({ branchName: seat.branch_name, tradeDate: l().trade_date })}
                                  />
                                )}
                              </For>
                            </div>
                          </Show>
                        </>
                      )
                    })()}
                  </>
                )}
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
