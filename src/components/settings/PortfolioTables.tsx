import { For, Show } from 'solid-js'
import './PortfolioTables.css'
import type { PendingOrder, PositionView, TradeRecord } from '../../types/portfolio'
import { fmtCurrency, fmtMoney, fmtPct, trendClass } from '../../types'

export interface PositionsTableProps {
  positions: PositionView[]
}

export function PortfolioPositionsTable(props: PositionsTableProps) {
  return (
    <div class="table-scroll-wrap">
      <table class="portfolio-grid-table">
        <thead>
          <tr>
            <th class="left">代码</th>
            <th class="left">名称</th>
            <th>持仓 / 可卖</th>
            <th>持仓成本</th>
            <th>当前价格</th>
            <th>最新市值</th>
            <th>浮动盈亏</th>
            <th>盈亏比例</th>
            <th>今日盈亏</th>
          </tr>
        </thead>
        <tbody>
          <Show
            when={props.positions.length > 0}
            fallback={
              <tr>
                <td colspan="9" class="table-empty">
                  当前账户暂无持仓
                </td>
              </tr>
            }
          >
            <For each={props.positions}>
              {(pos) => (
                <tr>
                  <td class="left">{pos.code}</td>
                  <td class="left">{pos.name}</td>
                  <td>
                    {pos.shares.toLocaleString()}
                    {pos.availableShares !== pos.shares ? (
                      <span class="sub-shares-tip"> (可卖:{pos.availableShares})</span>
                    ) : null}
                  </td>
                  <td>¥{pos.costPrice.toFixed(3)}</td>
                  <td>¥{pos.currentPrice.toFixed(2)}</td>
                  <td>{fmtCurrency(pos.marketValue)}</td>
                  <td class={trendClass(pos.floatingPnl)}>
                    {fmtMoney(pos.floatingPnl)}
                  </td>
                  <td class={trendClass(pos.floatingPnl)}>
                    {fmtPct(pos.floatingPnlPct)}
                  </td>
                  <td class={trendClass(pos.todayPnl)}>
                    {fmtMoney(pos.todayPnl)}
                  </td>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  )
}

export interface TradesTableProps {
  trades: TradeRecord[]
}

export function PortfolioTradesTable(props: TradesTableProps) {
  const formatTime = (ts: string) => {
    return ts && ts.length > 5 ? ts.slice(5) : (ts || '-')
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'Pending':
        return <span class="trade-status-badge pending">已挂单</span>
      case 'Cancelled':
        return <span class="trade-status-badge cancelled">已撤单</span>
      case 'Expired':
        return <span class="trade-status-badge expired">已失效</span>
      case 'Filled':
      default:
        return <span class="trade-status-badge filled">已成交</span>
    }
  }

  return (
    <div class="table-scroll-wrap">
      <table class="portfolio-grid-table">
        <thead>
          <tr>
            <th class="left">时间</th>
            <th class="left">标的</th>
            <th>方向</th>
            <th>状态</th>
            <th>价格</th>
            <th>数量</th>
            <th>发生金额</th>
            <th>手续费</th>
            <th>实现盈亏</th>
          </tr>
        </thead>
        <tbody>
          <Show
            when={props.trades.length > 0}
            fallback={
              <tr>
                <td colspan="9" class="table-empty">
                  暂无模拟交易记录
                </td>
              </tr>
            }
          >
            <For each={props.trades}>
              {(t) => (
                <tr>
                  <td class="left">{formatTime(t.timestamp)}</td>
                  <td class="left">
                    {t.name} ({t.code})
                  </td>
                  <td class={t.action === 'Buy' || (t.action as string) === 'buy' ? 'c-up' : 'c-down'}>
                    {t.action === 'Buy' || (t.action as string) === 'buy' ? '买入' : '卖出'}
                  </td>
                  <td>{getStatusBadge(t.status)}</td>
                  <td>¥{t.price.toFixed(2)}</td>
                  <td>{t.shares.toLocaleString()}</td>
                  <td>{fmtCurrency(t.amount)}</td>
                  <td>{t.status && t.status !== 'Filled' ? '-' : fmtCurrency(t.fee)}</td>
                  <td>
                    <Show when={(t.status === 'Filled' || !t.status) && t.realizedPnl !== null && t.realizedPnl !== undefined} fallback="-">
                      <span class={trendClass(t.realizedPnl!)}>
                        {fmtMoney(t.realizedPnl!)}
                      </span>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  )
}

export interface OrdersTableProps {
  orders: PendingOrder[]
  onCancel: (orderId: string) => void
  onCancelAll?: () => void
  disabled?: boolean
}

export function PortfolioOrdersTable(props: OrdersTableProps) {
  const formatTime = (ts: string) => {
    return ts && ts.length > 5 ? ts.slice(5) : (ts || '-')
  }

  return (
    <div class="table-scroll-wrap">
      <Show when={props.orders.length > 0 && props.onCancelAll}>
        <div class="table-action-header">
          <span class="table-sub-count">排队委托中 ({props.orders.length})</span>
          <button
            type="button"
            class="batch-cancel-btn"
            disabled={props.disabled}
            onClick={() => {
              if (confirm(`确认撤销当前券商的全部 ${props.orders.length} 笔挂单？`)) {
                props.onCancelAll!()
              }
            }}
          >
            全部撤单
          </button>
        </div>
      </Show>
      <table class="portfolio-grid-table">
        <thead>
          <tr>
            <th class="left">委托时间</th>
            <th class="left">标的</th>
            <th>方向</th>
            <th>委托价</th>
            <th>委托数量</th>
            <th>冻结资金</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <Show
            when={props.orders.length > 0}
            fallback={
              <tr>
                <td colspan="8" class="table-empty">
                  当前账户暂无挂单排队
                </td>
              </tr>
            }
          >
            <For each={props.orders}>
              {(o) => {
                const isBuy = o.action === 'Buy' || (o.action as string) === 'buy'
                return (
                  <tr>
                    <td class="left">{formatTime(o.createdAt)}</td>
                    <td class="left">
                      {o.name} ({o.code})
                    </td>
                    <td class={isBuy ? 'c-up' : 'c-down'}>
                      {isBuy ? '买入 (挂单)' : '卖出 (挂单)'}
                    </td>
                    <td>¥{o.price.toFixed(2)}</td>
                    <td>{o.shares.toLocaleString()}</td>
                    <td>{o.frozenCash > 0 ? fmtCurrency(o.frozenCash) : '-'}</td>
                    <td>
                      <span class="order-status-badge">排队中</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="table-cancel-btn"
                        disabled={props.disabled}
                        onClick={() => props.onCancel(o.id)}
                        title="撤销该挂单并立即解冻"
                      >
                        撤单
                      </button>
                    </td>
                  </tr>
                )
              }}
            </For>
          </Show>
        </tbody>
      </table>
    </div>
  )
}
