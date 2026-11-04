import { createMemo, createSignal, For, Show } from 'solid-js'
import './PortfolioClearedTable.css'
import {
  computeClearedSummary,
  sortClearedPositions,
  type ClearedPositionView,
  type ClearedSortField,
  type SortOrder,
} from './portfolioClearedHelpers'
import { fmtCurrency, fmtMoney, fmtPct, trendClass } from '../../types'

export interface PortfolioClearedTableProps {
  clearedPositions: ClearedPositionView[]
}

export function PortfolioClearedTable(props: PortfolioClearedTableProps) {
  const [sortField, setSortField] = createSignal<ClearedSortField>('time')
  const [sortOrder, setSortOrder] = createSignal<SortOrder>('desc')

  const summary = createMemo(() => computeClearedSummary(props.clearedPositions))

  const sortedList = createMemo(() =>
    sortClearedPositions(props.clearedPositions, sortField(), sortOrder())
  )

  const handleSort = (field: ClearedSortField) => {
    if (sortField() === field) {
      setSortOrder(sortOrder() === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const renderSortIndicator = (field: ClearedSortField) => {
    if (sortField() !== field) return null
    return <span class="sort-indicator">{sortOrder() === 'asc' ? '▲' : '▼'}</span>
  }

  const formatTime = (ts: string) => {
    return ts && ts.length > 5 ? ts.slice(5) : ts || '-'
  }

  return (
    <div class="portfolio-cleared-wrap">
      {/* 顶部专属清仓战报概览条 */}
      <div class="cleared-summary-bar">
        <div class="cleared-stat-group">
          <div class="cleared-stat-item">
            <span class="cleared-stat-label">清仓标的:</span>
            <span class="cleared-stat-val">{summary().totalCount} 只</span>
          </div>
          <div class="cleared-stat-item">
            <span class="cleared-stat-label">累计已结盈亏:</span>
            <span class={`cleared-stat-val ${trendClass(summary().totalRealizedPnl)}`}>
              {fmtMoney(summary().totalRealizedPnl)}
            </span>
          </div>
          <div class="cleared-stat-item">
            <span class="cleared-stat-label">胜率:</span>
            <span class="cleared-stat-val">
              {summary().winRate}%
              <span class="cleared-trade-tag"> ({summary().winCount}赢 {summary().lossCount}输)</span>
            </span>
          </div>
        </div>
        <div class="cleared-stat-item">
          <span class="cleared-stat-label">贡献手续费:</span>
          <span class="cleared-stat-val">{fmtCurrency(summary().totalFee)}</span>
        </div>
      </div>

      {/* 清仓明细表格 */}
      <div class="table-scroll-wrap">
        <table class="portfolio-grid-table">
          <thead>
            <tr>
              <th class="left">代码</th>
              <th class="left">名称</th>
              <th class="cleared-sort-th" onClick={() => handleSort('pnl')} title="点击排序已结盈亏">
                已结盈亏 {renderSortIndicator('pnl')}
              </th>
              <th class="cleared-sort-th" onClick={() => handleSort('pct')} title="点击排序收益率">
                累计收益率 {renderSortIndicator('pct')}
              </th>
              <th>累计买入额</th>
              <th>累计卖出额</th>
              <th>交易笔数</th>
              <th>贡献手续费</th>
              <th class="cleared-sort-th" onClick={() => handleSort('time')} title="点击排序清仓时间">
                清仓时间 {renderSortIndicator('time')}
              </th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={sortedList().length > 0}
              fallback={
                <tr>
                  <td colspan="9" class="table-empty">
                    当前账户暂无清仓标的历史记录
                  </td>
                </tr>
              }
            >
              <For each={sortedList()}>
                {(pos) => (
                  <tr>
                    <td class="left">{pos.code}</td>
                    <td class="left">{pos.name}</td>
                    <td class={trendClass(pos.realizedPnl)}>
                      {fmtMoney(pos.realizedPnl)}
                    </td>
                    <td class={trendClass(pos.realizedPnl)}>
                      {fmtPct(pos.realizedPct)}
                    </td>
                    <td>{fmtCurrency(pos.totalBuyAmount)}</td>
                    <td>{fmtCurrency(pos.totalSellProceeds)}</td>
                    <td>
                      <span class="cleared-trade-tag">
                        {pos.buyTradesCount}买 · {pos.sellTradesCount}卖
                      </span>
                    </td>
                    <td>{fmtCurrency(pos.totalFee)}</td>
                    <td>{formatTime(pos.clearedAt)}</td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>
      </div>
    </div>
  )
}
