//! Micro Tape Popover — Intraday stock vital metrics at a glance.
//!
//! Complies with AGENTS.md §11 (dedicated subcomponent, <=300 lines)
//! and §15 (theme-adaptive, high-contrast financial colors).

import { Show } from 'solid-js'
import {
  fmtAmount,
  fmtMarketCap,
  fmtPct,
  fmtPrice,
  fmtVol,
  isIndexCode,
  trendClass,
  type Quote,
} from '../../types'
import './MicroTapePopover.css'

export interface MicroTapePopoverProps {
  quote: Quote
  isPinned: boolean
  onClose: () => void
  onTogglePin?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  ref?: (el: HTMLDivElement) => void
}

export function MicroTapePopover(props: MicroTapePopoverProps) {
  const q = () => props.quote
  const isIndex = () => isIndexCode(q().code)
  const preClose = () => q().preClose || q().price

  const turnover = () => q().turnoverRate
  const volRatio = () => q().volumeRatio
  const amp = () => q().amplitude
  const avg = () => q().avgPrice
  const wb = () => q().weibi
  const amt = () => q().amount
  const mktCap = () => q().circulatingMarketCap

  // Ratio calculations for tape energy bar
  const activeBuyRatio = () => {
    const abr = q().activeBuyRatio
    if (abr != null && abr > 0 && abr < 1) {
      return abr
    }
    const outer = q().outerVol ?? 0
    const inner = q().innerVol ?? 0
    if (outer + inner > 0) {
      return outer / (outer + inner)
    }
    return 0.5
  }

  const buyPct = () => (activeBuyRatio() * 100).toFixed(1)
  const sellPct = () => ((1 - activeBuyRatio()) * 100).toFixed(1)

  // Price helper with color relative to preClose
  const priceColor = (val?: number | null) => {
    if (val == null || val <= 0 || !preClose()) return 'flat'
    return trendClass(val - preClose())
  }

  return (
    <div
      ref={props.ref}
      class="micro-tape-popover"
      classList={{ pinned: props.isPinned }}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      data-tauri-drag-region="none"
    >
      {/* 1. Header Bar */}
      <div class="tape-header">
        <div class="tape-title-group">
          <span class="tape-badge-tag">📊 核心盘口</span>
          <span class="tape-stock-name" title={q().name}>{q().name}</span>
          <span class="tape-stock-code">{q().code.replace(/^(sh|sz|bj|us|hk)/, '')}</span>
        </div>
        <div class="tape-actions">
          <button
            type="button"
            class="tape-pin-btn"
            classList={{ active: props.isPinned }}
            title={props.isPinned ? '已锁定 (点击解除)' : '点击锁定常驻'}
            onClick={() => props.onTogglePin?.()}
          >
            {props.isPinned ? '📌 已锁定' : '📌 锁定'}
          </button>
          <button
            type="button"
            class="tape-close-btn"
            title="关闭 (ESC)"
            onClick={() => props.onClose()}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 2. Row 1: 基准价格组 */}
      <div class="tape-grid-row">
        <div class="tape-cell">
          <span class="tape-label">今开</span>
          <span class={`tape-val font-mono ${priceColor(q().open)}`}>
            {q().open > 0 ? fmtPrice(q().open, 2) : '--'}
          </span>
        </div>
        <div class="tape-cell">
          <span class="tape-label">最高</span>
          <span class={`tape-val font-mono ${priceColor(q().high)}`}>
            {q().high > 0 ? fmtPrice(q().high, 2) : '--'}
          </span>
        </div>
        <div class="tape-cell">
          <span class="tape-label">最低</span>
          <span class={`tape-val font-mono ${priceColor(q().low)}`}>
            {q().low > 0 ? fmtPrice(q().low, 2) : '--'}
          </span>
        </div>
        <div class="tape-cell">
          <span class="tape-label">均价</span>
          <span class={`tape-val font-mono ${priceColor(avg())}`}>
            {avg() != null && avg()! > 0 ? fmtPrice(avg()!, 2) : '--'}
          </span>
        </div>
      </div>

      {/* 3. Row 2: 超短动能核心组 (重点高亮) */}
      <div class="tape-grid-row highlight-row">
        <Show
          when={!isIndex()}
          fallback={
            <>
              <div class="tape-cell col-span-2">
                <span class="tape-label">成交总额</span>
                <span class="tape-val font-mono font-bold">{fmtAmount(amt())}</span>
              </div>
              <div class="tape-cell col-span-2">
                <span class="tape-label">全天振幅</span>
                <span class="tape-val font-mono">{amp() != null ? `${amp()!.toFixed(2)}%` : '--'}</span>
              </div>
            </>
          }
        >
          <div class="tape-cell">
            <span class="tape-label">换手率</span>
            <span
              class="tape-val font-mono font-bold"
              classList={{
                'text-hot': (turnover() ?? 0) >= 15,
                'text-warm': (turnover() ?? 0) >= 7 && (turnover() ?? 0) < 15,
              }}
            >
              {turnover() != null ? `${turnover()!.toFixed(2)}%` : '--'}
            </span>
          </div>
          <div class="tape-cell">
            <span class="tape-label">成交额</span>
            <span class="tape-val font-mono font-bold">{fmtAmount(amt())}</span>
          </div>
          <div class="tape-cell">
            <span class="tape-label">量比</span>
            <span
              class="tape-val font-mono font-bold"
              classList={{
                'text-hot': (volRatio() ?? 0) >= 2.5,
                'text-warm': (volRatio() ?? 0) >= 1.5 && (volRatio() ?? 0) < 2.5,
              }}
            >
              {volRatio() != null ? volRatio()!.toFixed(2) : '--'}
            </span>
          </div>
          <div class="tape-cell">
            <span class="tape-label">振幅</span>
            <span class="tape-val font-mono">
              {amp() != null ? `${amp()!.toFixed(2)}%` : '--'}
            </span>
          </div>
        </Show>
      </div>

      {/* 4. Row 3: 盘口博弈与流通市值组 */}
      <Show when={!isIndex()}>
        <div class="tape-grid-row">
          <div class="tape-cell">
            <span class="tape-label">流通市值</span>
            <span class="tape-val font-mono">{fmtMarketCap(mktCap())}</span>
          </div>
          <div class="tape-cell">
            <span class="tape-label">委比</span>
            <span class={`tape-val font-mono ${trendClass(wb() ?? 0)}`}>
              {wb() != null ? fmtPct(wb()!) : '--'}
            </span>
          </div>
          <div class="tape-cell">
            <span class="tape-label">外盘(买)</span>
            <span class="tape-val font-mono up">{fmtVol(q().outerVol ?? 0)}手</span>
          </div>
          <div class="tape-cell">
            <span class="tape-label">内盘(卖)</span>
            <span class="tape-val font-mono down">{fmtVol(q().innerVol ?? 0)}手</span>
          </div>
        </div>

        {/* 5. 多空力量红绿能量条 */}
        <div class="tape-energy-section">
          <div class="tape-energy-labels">
            <span class="tape-side up">买方主动 {buyPct()}%</span>
            <span class="tape-mid-label">多空对抗</span>
            <span class="tape-side down">卖方砸盘 {sellPct()}%</span>
          </div>
          <div class="tape-energy-bar">
            <div class="tape-bar-segment buy" style={{ width: `${buyPct()}%` }} />
            <div class="tape-bar-segment sell" style={{ width: `${sellPct()}%` }} />
          </div>
        </div>
      </Show>

      {/* 6. Footer Hint */}
      <div class="tape-footer-hint">
        {props.isPinned ? '已锁定显示 · 点击右上角或按 ESC 解除' : '点击标头可锁定常驻 · 鼠标移出自动隐去'}
      </div>
    </div>
  )
}
