import { fmtCurrency, fmtMoney, trendClass } from '../../types'

export interface PortfolioStatsGridProps {
  brokerEquity: number
  brokerCash: number
  brokerMarketValue: number
  brokerPnl: number
  brokerTodayPnl: number
  brokerRatio: number
  positionCount: number
  onOpenTransferModal: () => void
}

export function PortfolioStatsGrid(props: PortfolioStatsGridProps) {
  return (
    <div class="portfolio-stats-grid portfolio-overview">
      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">总资产 (本券商)</span>
          <span class="stat-pill">仓位 {props.brokerRatio.toFixed(1)}%</span>
        </div>
        <div class="stat-value">{fmtCurrency(props.brokerEquity)}</div>
      </div>

      <div class="stat-card highlight">
        <div class="stat-header">
          <span class="stat-label">可用现金</span>
          <button
            type="button"
            class="stat-action-btn"
            onClick={props.onOpenTransferModal}
            title="存取资金（转入追加或转出提取）"
          >
            + 资金存取
          </button>
        </div>
        <div class="stat-value">{fmtCurrency(props.brokerCash)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">证券总市值</span>
          <span class="stat-sub-label">{props.positionCount} 只持仓</span>
        </div>
        <div class="stat-value">{fmtCurrency(props.brokerMarketValue)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-header">
          <span class="stat-label">累计持仓浮盈</span>
          <span class={`stat-sub-pnl ${trendClass(props.brokerTodayPnl)}`}>
            今日 {fmtMoney(props.brokerTodayPnl)}
          </span>
        </div>
        <div class={`stat-value ${trendClass(props.brokerPnl)}`}>
          {fmtMoney(props.brokerPnl)}
        </div>
      </div>
    </div>
  )
}
