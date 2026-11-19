import { Show } from 'solid-js'
import type { StockDragonTiger } from './types'
import { fmtMoney, getDaysDiff, getLhbPeriodType, shortenLhbReason } from './utils'

export interface LhbSummaryCardProps {
  data: StockDragonTiger
}

/**
 * Top summary card for Dragon Tiger drawer, featuring:
 * - Trade date, 1-day/3-day badge, exchange explanation reason
 * - Duel overview: Total buy, Total sell, Net volume
 * - Proportion duel energy bar (Buy vs Sell weight)
 * - Secondary metrics: Institution net participation & Close price
 */
export function LhbSummaryCard(props: LhbSummaryCardProps) {
  const dt = () => props.data

  const totalBuy = () => dt().top_buyers.reduce((acc, s) => acc + (s.buy_amount || 0), 0)
  const totalSell = () => dt().top_sellers.reduce((acc, s) => acc + (s.sell_amount || 0), 0)
  const netBuy = () => totalBuy() - totalSell()

  const ratioTotal = () => totalBuy() + totalSell()
  const buyPct = () => (ratioTotal() > 0 ? (totalBuy() / ratioTotal()) * 100 : 50)
  const sellPct = () => (ratioTotal() > 0 ? (totalSell() / ratioTotal()) * 100 : 50)

  return (
    <div class="lhb-summary-card">
      {/* Header: Period, Reason, Trade Date */}
      <div class="lhb-summary-header">
        <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', 'max-width': '72%' }}>
          <span
            class={`lhb-period-badge ${getLhbPeriodType(dt().reason) === '3day' ? 'cumulative' : ''}`}
          >
            {getLhbPeriodType(dt().reason) === '3day' ? '3日累计' : '单日榜'}
          </span>
          <span class="lhb-reason-tag" title={dt().reason}>
            ⚡ {shortenLhbReason(dt().reason)}
          </span>
        </div>
        <Show
          when={getDaysDiff(dt().trade_date) > 5}
          fallback={<span class="lhb-date-tag">上榜日 {dt().trade_date}</span>}
        >
          <span
            class="lhb-date-tag is-stale"
            title={`该标的近期未触发异动披露，此为历史最后一次上榜记录（距今已超 ${getDaysDiff(dt().trade_date)} 天）`}
          >
            ⚠️ 历史复盘 {dt().trade_date}
          </span>
        </Show>
      </div>

      {/* Main duel figures: 总买 / 净买 / 总卖 */}
      <div class="lhb-duel-banner">
        <div class="lhb-duel-stat">
          <span class="lhb-duel-lbl">总买(前五)</span>
          <span class="lhb-duel-val buy">{fmtMoney(totalBuy(), false)}</span>
        </div>
        <div class="lhb-duel-stat center">
          <span class="lhb-duel-lbl">多空净额</span>
          <span
            class="lhb-duel-val"
            classList={{
              'net-up': netBuy() > 0,
              'net-down': netBuy() < 0,
              'net-flat': netBuy() === 0,
            }}
          >
            {fmtMoney(netBuy(), true)}
          </span>
        </div>
        <div class="lhb-duel-stat right">
          <span class="lhb-duel-lbl">总卖(前五)</span>
          <span class="lhb-duel-val sell">{fmtMoney(totalSell(), false)}</span>
        </div>
      </div>

      {/* Duel energy bar (多空对抗比例条) */}
      <div class="lhb-energy-container">
        <div class="lhb-energy-bar">
          <div
            class="lhb-energy-segment buy"
            style={{ width: `${buyPct().toFixed(1)}%` }}
            title={`买方前五占比: ${buyPct().toFixed(1)}%`}
          />
          <div
            class="lhb-energy-segment sell"
            style={{ width: `${sellPct().toFixed(1)}%` }}
            title={`卖方前五占比: ${sellPct().toFixed(1)}%`}
          />
        </div>
        <div class="lhb-energy-labels">
          <span class="buy-lbl">买方 {buyPct().toFixed(0)}%</span>
          <span class="sell-lbl">卖方 {sellPct().toFixed(0)}%</span>
        </div>
      </div>

      {/* Sub row: 机构净参与 & 当日收盘 */}
      <div class="lhb-stat-sub-row">
        <div class="lhb-sub-item">
          <span class="lhb-stat-lbl">机构净参与</span>
          <span
            class="lhb-stat-val-sm"
            classList={{
              up: dt().institution_net > 0,
              down: dt().institution_net < 0,
              flat: dt().institution_net === 0,
            }}
          >
            {dt().institution_net === 0 ? '0' : fmtMoney(dt().institution_net, true)}
          </span>
        </div>
        <Show when={dt().close_price > 0}>
          <div class="lhb-sub-item right">
            <span class="lhb-stat-lbl">当日收盘</span>
            <span
              class="lhb-stat-val-sm"
              classList={{
                up: dt().change_pct > 0,
                down: dt().change_pct < 0,
                flat: dt().change_pct === 0,
              }}
            >
              {dt().close_price.toFixed(2)}
              <span class="lhb-stat-pct">
                {dt().change_pct >= 0 ? '+' : ''}
                {dt().change_pct.toFixed(2)}%
              </span>
            </span>
          </div>
        </Show>
      </div>
    </div>
  )
}
