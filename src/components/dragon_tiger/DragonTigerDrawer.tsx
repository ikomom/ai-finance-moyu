import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import './DragonTigerDrawer.css'
import type { DragonTigerSeat, StockDetailInfo } from './types'
import { fetchStockDragonTiger } from '../../tauri'
import { navigateToStock } from '../../store'
import { SeatDetailView } from './SeatDetailView'

export interface DragonTigerDrawerProps {
  code: string
  name?: string
  onClose: () => void
}

function fmtMoney(amt: number): string {
  const sign = amt > 0 ? '+' : amt < 0 ? '-' : ''
  const abs = Math.abs(amt)
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}万`
  return `${sign}${abs.toFixed(0)}`
}

function getSeatTagClass(label: string): string {
  return label === '机构专用' ? 'institution' : label === '北向外资' ? 'north' : 'trader'
}

/** Clean up verbose corporate entity suffixes to maximize space for branch city and road name. */
export function cleanBranchName(name: string): string {
  if (!name) return '--'
  return name
    .replace(/股份有限公司/g, '')
    .replace(/有限责任公司/g, '')
    .replace(/证券营业部/g, '营业部')
}

/** Shorten verbose official exchange explanation strings to concise trader terminology. */
export function shortenLhbReason(reason: string): string {
  if (!reason) return '龙虎榜披露'
  let s = reason
    .replace(/^非(?:ST、\*ST和|ST和|ST、)?S?证券/, '')
    .replace(/的前\d+只证券$/, '')
    .replace(/的证券$/, '')
    .trim()
  s = s
    .replace(/连续三个交易日内收盘价格涨幅偏离值累计达到(\d+%)?/, '3日涨幅偏离达$1')
    .replace(/连续三个交易日内收盘价格跌幅偏离值累计达到(\d+%)?/, '3日跌幅偏离达$1')
    .replace(/连续三个交易日内收盘价涨幅偏离值累计达到(\d+%)?/, '3日涨幅偏离达$1')
    .replace(/连续三个交易日内收盘价跌幅偏离值累计达到(\d+%)?/, '3日跌幅偏离达$1')
    .replace(/日收盘价涨幅偏离值达到(\d+%)?/, '日涨幅偏离达$1')
    .replace(/日收盘价跌幅偏离值达到(\d+%)?/, '日跌幅偏离达$1')
    .replace(/日涨幅偏离值达到(\d+%)?/, '日涨幅偏离达$1')
    .replace(/日跌幅偏离值达到(\d+%)?/, '日跌幅偏离达$1')
    .replace(/日换手率达到(\d+%)?/, '日换手率达$1')
    .replace(/日振幅值达到(\d+%)?/, '日振幅达$1')
    .replace(/无价格涨跌幅限制/, '无涨跌幅限制')
  return s.length > 18 ? s.slice(0, 16) + '…' : s
}

export function DragonTigerDrawer(props: DragonTigerDrawerProps) {
  const [currentCode, setCurrentCode] = createSignal(props.code)
  const [currentName, setCurrentName] = createSignal(props.name)
  const [selectedSeat, setSelectedSeat] = createSignal<{ branchName: string; tradeDate?: string } | null>(null)

  const [data, setData] = createSignal<StockDetailInfo | null>(null)
  const [loading, setLoading] = createSignal(true)

  createEffect(() => {
    setCurrentCode(props.code)
    setCurrentName(props.name)
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
        if (e.target === e.currentTarget) props.onClose()
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
          <button
            type="button"
            class="lhb-close-btn"
            onClick={props.onClose}
            title="关闭 (Esc)"
          >
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
                setSelectedSeat(null)
                setCurrentCode(code)
                setCurrentName(name)
                lastLoadedCode = ''
                void loadData(code)
              }}
              onOpenInWidget={(code) => {
                navigateToStock(code)
                props.onClose()
              }}
            />
          }
        >
          <Show
            when={!loading()}
            fallback={
              <div class="lhb-empty-card">
                <span>⌛ 正在拉取龙虎榜席位数据…</span>
              </div>
            }
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
                        <span class="lhb-reason-tag" title={l().reason}>
                          ⚡ {shortenLhbReason(l().reason)}
                        </span>
                        <span class="lhb-date-tag">上榜日 {l().trade_date}</span>
                      </div>

                      <div class="lhb-stat-grid">
                        <div class="lhb-stat-box">
                          <span class="lhb-stat-lbl">龙虎总净买</span>
                          <span class={`lhb-stat-val ${l().net_total >= 0 ? 'up' : 'down'}`}>
                            {fmtMoney(l().net_total)}
                          </span>
                        </div>
                        <div class="lhb-stat-box">
                          <span class="lhb-stat-lbl">机构净参与</span>
                          <span
                            class={`lhb-stat-val ${
                              l().institution_net > 0 ? 'up' : l().institution_net < 0 ? 'down' : 'flat'
                            }`}
                          >
                            {l().institution_net === 0 ? '0' : fmtMoney(l().institution_net)}
                          </span>
                        </div>
                        <Show when={l().close_price > 0}>
                          <div class="lhb-stat-box">
                            <span class="lhb-stat-lbl">当日收盘</span>
                            <span class={`lhb-stat-val ${l().change_pct >= 0 ? 'up' : 'down'}`}>
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

                    <div class="lhb-section-header">
                      <span>🟢 买入前五席位</span>
                    </div>
                    <div class="lhb-seat-list">
                      <For each={l().top_buyers}>
                        {(seat: DragonTigerSeat, idx) => (
                          <div
                            class="lhb-seat-row is-clickable"
                            onClick={() =>
                              setSelectedSeat({
                                branchName: seat.branch_name,
                                tradeDate: l().trade_date,
                              })
                            }
                            title="点击下钻查看该席位操盘战绩与买卖标的"
                          >
                            <div class="lhb-seat-left">
                              <span class="lhb-seat-rank">{idx() + 1}</span>
                              <span class="lhb-seat-branch">
                                {cleanBranchName(seat.branch_name)}
                              </span>
                              <Show when={seat.trader_label}>
                                {(tag) => (
                                  <span class={`lhb-seat-tag ${getSeatTagClass(tag())}`}>
                                    {tag()}
                                  </span>
                                )}
                              </Show>
                            </div>
                            <div class={`lhb-seat-right ${seat.net_amount >= 0 ? 'up' : 'down'}`}>
                              {fmtMoney(seat.net_amount)}
                              <span class="lhb-seat-arrow">›</span>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>

                    <Show when={l().top_sellers.length > 0}>
                      <div class="lhb-section-header" style={{ "margin-top": "8px" }}>
                        <span>🔴 卖出前五席位</span>
                      </div>
                      <div class="lhb-seat-list">
                        <For each={l().top_sellers}>
                          {(seat: DragonTigerSeat, idx) => (
                            <div
                              class="lhb-seat-row is-clickable"
                              onClick={() =>
                                setSelectedSeat({
                                  branchName: seat.branch_name,
                                  tradeDate: l().trade_date,
                                })
                              }
                              title="点击下钻查看该席位操盘战绩与买卖标的"
                            >
                              <div class="lhb-seat-left">
                                <span class="lhb-seat-rank">{idx() + 1}</span>
                                <span class="lhb-seat-branch">
                                  {cleanBranchName(seat.branch_name)}
                                </span>
                                <Show when={seat.trader_label}>
                                  {(tag) => (
                                    <span class={`lhb-seat-tag ${getSeatTagClass(tag())}`}>
                                      {tag()}
                                    </span>
                                  )}
                                </Show>
                              </div>
                              <div class="lhb-seat-right down">
                                {fmtMoney(seat.net_amount)}
                                <span class="lhb-seat-arrow">›</span>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
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
