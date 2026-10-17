import { Show, type JSX } from 'solid-js'
import { fmtPct, fmtPrice, trendClass } from '../types'
import './StockHeader.css'

export interface StockHeaderProps {
  name: string
  code: string
  price: number
  changePct: number
  activePrice?: number
  activePct?: number
  high?: number | null
  low?: number | null
  badge?: JSX.Element
  hoverTime?: string | null
  hoverExtra?: string | null
  extraInfo?: JSX.Element
}

/**
 * 迷你/看板通用的标头与大字行情组件 (包含代码名称、徽标槽、日内极值、大字价格、动态 Hover 指示与副信息槽).
 */
export function StockHeader(props: StockHeaderProps) {
  const currentPrice = () => (props.activePrice != null ? props.activePrice : props.price)
  const currentPct = () => (props.activePct != null ? props.activePct : props.changePct)
  const displayCode = () => props.code.replace(/^(sh|sz|bj|us|hk|gz)/, '')

  return (
    <>
      {/* 头部元数据栏 */}
      <div class="mini-meta" data-tauri-drag-region>
        <div class="meta-left">
          <span class="name">{props.name}</span>
          <span class="code">{displayCode()}</span>
          <Show when={props.badge}>{props.badge}</Show>
        </div>
        <div class="meta-right">
          <Show when={props.high != null && props.low != null}>
            <div class="stats-text">
              <span>高 <b class="up">{fmtPrice(props.high!, 2)}</b></span>
              <span>低 <b class="down">{fmtPrice(props.low!, 2)}</b></span>
            </div>
          </Show>
        </div>
      </div>

      {/* 大字行情与信息指示栏 */}
      <div class="mini-price-row">
        <span class={`big-price ${props.price > 0 ? trendClass(currentPct()) : 'flat'}`}>
          {props.price > 0 ? fmtPrice(currentPrice(), 2) : '--'}
        </span>
        <span class={`big-pct ${props.price > 0 ? trendClass(currentPct()) : 'flat'}`}>
          {props.price > 0 ? fmtPct(currentPct()) : '--'}
        </span>
        <Show
          when={props.hoverTime}
          fallback={
            <Show when={props.extraInfo}>
              {props.extraInfo}
            </Show>
          }
        >
          <span class="hover-time-tag">
            {props.hoverTime}
            {props.hoverExtra ? ` · ${props.hoverExtra}` : ''}
          </span>
        </Show>
      </div>
    </>
  )
}
