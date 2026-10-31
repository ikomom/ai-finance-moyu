import { createSignal, For, onMount, Show } from 'solid-js'
import './MarketDragonTigerTab.css'
import type { FamousTraderMove, MarketDragonTigerOverview, MarketLhbStockItem } from './types'
import { fetchMarketDragonTiger } from '../../tauri'
import { fmtPct, fmtPrice, trendClass } from '../../types'

export interface MarketDragonTigerTabProps {
  onOpenDrawer?: (code: string, name?: string) => void
}

function fmtAmount(amt: number): string {
  const abs = Math.abs(amt)
  const sign = amt > 0 ? '+' : amt < 0 ? '-' : ''
  if (abs >= 1e8) {
    return `${sign}${(abs / 1e8).toFixed(2)}亿`
  }
  if (abs >= 1e4) {
    return `${sign}${(abs / 1e4).toFixed(0)}万`
  }
  return `${sign}${abs.toFixed(0)}`
}

export function MarketDragonTigerTab(props: MarketDragonTigerTabProps) {
  const [data, setData] = createSignal<MarketDragonTigerOverview | null>(null)
  const [loading, setLoading] = createSignal(true)

  onMount(async () => {
    try {
      const res = await fetchMarketDragonTiger()
      setData(res)
    } finally {
      setLoading(false)
    }
  })

  return (
    <div class="market-lhb-wrap">
      {/* 披露日期栏 */}
      <div class="market-lhb-date-bar">
        <span>交易所盘后公开披露数据</span>
        <Show when={data()?.trade_date}>
          {(d) => <span class="market-lhb-date-badge">披露日 {d()}</span>}
        </Show>
      </div>

      <Show
        when={!loading() && data()}
        fallback={
          <div style={{ padding: "20px", "text-align": "center", color: "#64748b", "font-size": "11px" }}>
            ⌛ 正在拉取龙虎榜机构与游资动向…
          </div>
        }
      >
        {/* 机构净买入 Top 5 */}
        <div class="market-lhb-section">
          <div class="market-lhb-sec-title">
            <span>🏛️ 机构大额净买入 Top 5</span>
          </div>
          <div class="market-lhb-stock-list">
            <For each={data()!.top_institution_stocks}>
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
                    <span class="market-lhb-net-label">机构净买</span>
                    <span class={`market-lhb-net-val ${stock.institution_net >= 0 ? 'up' : 'down'}`}>
                      {fmtAmount(stock.institution_net)}
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
            <For each={data()!.famous_trader_moves}>
              {(move: FamousTraderMove) => {
                const isBuy = move.action.includes('买') || move.net_amount >= 0
                return (
                  <div
                    class="trader-move-card"
                    onClick={() => props.onOpenDrawer?.(move.stock_code, move.stock_name)}
                    title={`点击查看 ${move.stock_name} 龙虎榜详情`}
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
                        {fmtAmount(move.net_amount)}
                      </span>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}
