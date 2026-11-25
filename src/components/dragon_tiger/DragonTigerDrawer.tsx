import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import './DragonTigerDrawer.css'
import type { DragonTigerSeat, StockDetailInfo } from './types'
import { fetchStockDragonTiger } from '../../tauri'
import { useBackInterceptor } from '../../services/backInterceptor'
import { navigateToStock } from '../../store'
import { SeatDetailView } from './SeatDetailView'
import { SeatRow } from './SeatRow'
import { LhbSummaryCard } from './LhbSummaryCard'
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
  const [stockStack, setStockStack] = createSignal<
    Array<{ code: string; name?: string; highlightBranch?: string }>
  >([])

  const [data, setData] = createSignal<StockDetailInfo | null>(null)
  const [loading, setLoading] = createSignal(true)

  createEffect(() => {
    setCurrentCode(props.code)
    setCurrentName(props.name)
    setHighlightBranch(props.highlightBranch)
    setStockStack([])
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

  const handleStepBack = () => {
    if (selectedSeat()) {
      setSelectedSeat(null)
      return
    }
    const stack = stockStack()
    if (stack.length > 0) {
      const prev = stack[stack.length - 1]
      setStockStack(stack.slice(0, -1))
      setHighlightBranch(prev.highlightBranch)
      setCurrentCode(prev.code)
      setCurrentName(prev.name)
      lastLoadedCode = ''
      void loadData(prev.code)
      return
    }
    props.onClose()
  }

  useBackInterceptor(() => true, handleStepBack)

  onMount(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleStepBack()
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
          handleStepBack()
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
                setStockStack((prev) => [
                  ...prev,
                  { code: currentCode(), name: currentName(), highlightBranch: highlightBranch() },
                ])
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
                {(l) => {
                  const maxBuyerAmt = () => Math.max(...l().top_buyers.map((s) => s.buy_amount || 0), 1)
                  const maxSellerAmt = () => Math.max(...l().top_sellers.map((s) => s.sell_amount || 0), 1)
                  const pairs = () => analyzeSeatPairs(l().top_buyers, l().top_sellers)

                  return (
                    <>
                      <LhbSummaryCard data={l()} />

                      <div class="lhb-section-header buy">
                        <span class="lhb-section-title">🔺 买方席位前5</span>
                        <span class="lhb-section-col-labels">买入 / 卖出</span>
                      </div>
                      <div class="lhb-seat-list">
                        <For each={l().top_buyers}>
                          {(seat: DragonTigerSeat, idx) => (
                            <SeatRow
                              idx={idx()}
                              seat={seat}
                              meta={pairs().buyerMetas[idx()]}
                              isBuy={true}
                              maxAmt={maxBuyerAmt()}
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
                          <span class="lhb-section-title">🔻 卖方席位前5</span>
                          <span class="lhb-section-col-labels">卖出 / 买入</span>
                        </div>
                        <div class="lhb-seat-list">
                          <For each={l().top_sellers}>
                            {(seat: DragonTigerSeat, idx) => (
                              <SeatRow
                                idx={idx()}
                                seat={seat}
                                meta={pairs().sellerMetas[idx()]}
                                isBuy={false}
                                maxAmt={maxSellerAmt()}
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
                }}
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  )
}
