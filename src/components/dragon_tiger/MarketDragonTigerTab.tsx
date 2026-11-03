import { createSignal, For, onMount, Show } from 'solid-js'
import './MarketDragonTigerTab.css'
import type { FamousTraderMove, MarketDragonTigerOverview, MarketLhbStockItem } from './types'
import { fetchMarketDragonTiger } from '../../tauri'
import { fmtPct, fmtPrice, trendClass } from '../../types'
import { fmtMoney, trendMoneyClass } from './utils'
import { SeatRadarView } from './SeatRadarView'

export interface MarketDragonTigerTabProps {
  onOpenDrawer?: (code: string, name?: string, highlightBranch?: string) => void
}

function getSessionNotice(tradeDate?: string): { text: string; badge: string } {
  const now = new Date()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const timeNum = hours * 100 + minutes

  if (timeNum >= 915 && timeNum < 1500) {
    return {
      text: '盘中竞价 · 数据为上一个交易日盘后披露',
      badge: tradeDate ? `参考日 ${tradeDate}` : '盘前参考 (T-1)',
    }
  }
  if (timeNum >= 1500 && timeNum < 1700) {
    return {
      text: '盘后结算 · 今日龙虎榜披露中 (通常16:30~17:30)',
      badge: '披露中',
    }
  }
  return {
    text: '交易所盘后官方公开披露数据',
    badge: tradeDate ? `披露日 ${tradeDate}` : '已披露',
  }
}

// Module-level persistent state across dock collapse/expand & layout switches
const [persistedSubTab, setPersistedSubTab] = createSignal<'overview' | 'radar'>('overview')

export function MarketDragonTigerTab(props: MarketDragonTigerTabProps) {
  const subTab = persistedSubTab
  const setSubTab = setPersistedSubTab
  const [data, setData] = createSignal<MarketDragonTigerOverview | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [showAllLhb, setShowAllLhb] = createSignal(false)

  onMount(async () => {
    try {
      const res = await fetchMarketDragonTiger()
      setData(res)
    } finally {
      setLoading(false)
    }
  })

  const displayedStocks = () => {
    const list = data()?.top_institution_stocks ?? []
    return showAllLhb() ? list : list.slice(0, 5)
  }

  return (
    <div class="market-lhb-wrap">
      {/* 二级切换：🔥 游资动向 vs 🎯 席位雷达 */}
      <div class="lhb-sub-tabs">
        <button
          type="button"
          class={`lhb-sub-tab-btn ${subTab() === 'overview' ? 'active' : ''}`}
          onClick={() => setSubTab('overview')}
        >
          🔥 游资动向
        </button>
        <button
          type="button"
          class={`lhb-sub-tab-btn ${subTab() === 'radar' ? 'active' : ''}`}
          onClick={() => setSubTab('radar')}
        >
          🎯 席位雷达
        </button>
      </div>

      <Show when={subTab() === 'radar'}>
        <SeatRadarView onOpenDrawer={props.onOpenDrawer} />
      </Show>

      <Show when={subTab() === 'overview'}>
        {/* 披露日期与时序感知栏 */}
        <div class="market-lhb-date-bar">
          <span>{getSessionNotice(data()?.trade_date).text}</span>
          <span class="market-lhb-date-badge">
            {getSessionNotice(data()?.trade_date).badge}
          </span>
        </div>

        <Show
          when={!loading()}
          fallback={
            <div style={{ padding: "24px 0", "text-align": "center", color: "#64748b", "font-size": "11px" }}>
              ⌛ 正在拉取龙虎榜机构与游资动向…
            </div>
          }
        >
          <Show
            when={data()}
            fallback={
              <div style={{ padding: "24px 0", "text-align": "center", color: "#64748b", "font-size": "11px" }}>
                🏛️ 暂无公开披露的龙虎榜数据
              </div>
            }
          >
            {/* 龙虎榜大额净买入 Top 5 / 查看全部 */}
            <div class="market-lhb-section">
              <div class="market-lhb-sec-title">
                <span>🏆 龙虎榜大额净买入 {showAllLhb() ? `(全部 ${data()!.top_institution_stocks.length} 只)` : 'Top 5'}</span>
                <Show when={data()!.top_institution_stocks.length > 5}>
                  <button
                    type="button"
                    class="market-lhb-expand-btn"
                    onClick={() => setShowAllLhb(!showAllLhb())}
                    title="切换展示完整龙虎榜大额净买入标的"
                  >
                    {showAllLhb() ? '收起 ▴' : `查看全部 (${data()!.top_institution_stocks.length}) ▾`}
                  </button>
                </Show>
              </div>
              <div class="market-lhb-stock-list">
                <For each={displayedStocks()}>
                  {(stock: MarketLhbStockItem) => (
                    <div
                      class="market-lhb-stock-row"
                      onClick={() => props.onOpenDrawer?.(stock.code, stock.name)}
                      title="点击查看该股龙虎榜席位详情"
                    >
                      <div class="market-lhb-stock-main">
                        <span class="market-lhb-stock-name">{stock.name}</span>
                        <span class="market-lhb-stock-code">{stock.code}</span>
                      </div>

                      <div class="market-lhb-stock-price-box">
                        <span class={`market-lhb-stock-price ${trendClass(stock.change_pct)}`}>
                          {fmtPrice(stock.price, 2)}
                        </span>
                        <span class={`market-lhb-stock-pct ${trendClass(stock.change_pct)}`}>
                          {fmtPct(stock.change_pct)}
                        </span>
                      </div>

                      <div class="market-lhb-stock-net">
                        <span class="market-lhb-net-label">榜单净买</span>
                        <span class={`market-lhb-net-val ${trendMoneyClass(stock.net_total)}`}>
                          {fmtMoney(stock.net_total)}
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            {/* 游资大佬动向 */}
            <div class="market-lhb-section" style={{ "margin-top": "6px" }}>
              <div class="market-lhb-sec-title">
                <span>⚡ 知名游资动向追踪</span>
              </div>
              <div class="trader-moves-grid">
                <For
                  each={data()!.famous_trader_moves}
                  fallback={
                    <div class="trader-moves-empty">
                      <span>🏛️ 今日官方披露榜单中暂无预设顶流游资上榜</span>
                      <button
                        type="button"
                        class="trader-moves-goto-radar"
                        onClick={() => setSubTab('radar')}
                      >
                        🎯 切换至席位雷达自定义回溯 ›
                      </button>
                    </div>
                  }
                >
                  {(move: FamousTraderMove) => {
                    const isBuy = move.action.includes('买')
                      ? true
                      : move.action.includes('卖')
                      ? false
                      : move.net_amount > 0
                    return (
                      <div
                        class="trader-move-card"
                        onClick={() => props.onOpenDrawer?.(move.stock_code, move.stock_name, move.trader_name)}
                        title={`点击查看 ${move.stock_name} 龙虎榜详情（高亮 ${move.trader_name} 席位）`}
                        style={{ cursor: "pointer" }}
                      >
                        <div class="trader-move-top">
                          <span class="trader-name-badge">{move.trader_name}</span>
                          <span class={`trader-action-pill ${isBuy ? 'buy' : 'sell'}`}>
                            {move.action}
                          </span>
                        </div>
                        <div class="trader-move-bottom">
                          <span class="trader-target-stock">{move.stock_name}</span>
                          <span class={`trader-target-amt ${isBuy ? 'up' : 'down'}`}>
                            {fmtMoney(move.net_amount)}
                          </span>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
