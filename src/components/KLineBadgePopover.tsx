//! Financial-grade 3-second tactical judgment popover for daily K-line diagnosis.
//!
//! Complies with AGENTS.md §11 (isolated subcomponent, <=300 lines).

import { Show } from 'solid-js'
import { fmtPrice, fmtSigned, type KLineBar } from '../types'
import type { StockDecisionResult } from '../types/aiDecision'

export interface KLineBadgePopoverProps {
  ref?: (el: HTMLDivElement) => void
  label: string
  action: string
  tone: 'bull' | 'bear' | 'warn' | 'neutral'
  comment: string
  lastBar: KLineBar | null
  bias20: number | null
  bias5: number | null
  kdjStatus: string | null
  support: number | null
  resistance: number | null
  aiResult?: StockDecisionResult | null
  aiLoading?: boolean
  onRefresh?: () => void
}

export function KLineBadgePopover(props: KLineBadgePopoverProps) {
  const b = () => props.lastBar
  const ai = () => props.aiResult

  const kdjText = () => {
    if (props.kdjStatus) return props.kdjStatus
    if (b()?.k != null && b()?.d != null && b()?.j != null) {
      return `K:${b()!.k} D:${b()!.d} J:${b()!.j}`
    }
    return '数据积累中'
  }

  const levelsText = () => {
    const parts: string[] = []
    if (props.resistance != null) parts.push(`阻力 ${props.resistance.toFixed(2)} (前5日高)`)
    if (props.support != null) parts.push(`支撑 ${props.support.toFixed(2)} (前5日低)`)
    return parts.length > 0 ? parts.join(' · ') : '正在计算关键位'
  }

  return (
    <div ref={props.ref} class="stock-popover" onWheel={(e) => e.stopPropagation()}>
      {/* 1. 顶部：形态 + 操盘动作大标 + 生命线 MA20 / AI 置信度 */}
      <div class="stock-popover-head">
        <div class="stock-head-left">
          <span class={`stock-badge-title ${props.tone}`}>
            {props.label} · {props.action}
          </span>
        </div>

        <Show
          when={ai()}
          fallback={
            <Show when={b()?.ma20 != null}>
              <div class="stock-quant-meta">
                <span class="quant-conf font-mono">
                  生命线 MA20: {fmtPrice(b()!.ma20!)}
                </span>
                <Show when={props.bias20 != null}>
                  <span class={`quant-mode-tag font-mono ${props.bias20! >= 0 ? 'bull' : 'bear'}`}>
                    {fmtSigned(props.bias20!)}%
                  </span>
                </Show>
              </div>
            </Show>
          }
        >
          <div class="stock-quant-meta">
            <span class="quant-conf font-mono">
              置信度 {(ai()!.actionConfidence * 100).toFixed(0)}%
            </span>
            <span class="quant-mode-tag">
              {ai()!.mode === 'online' ? '线上引擎' : '本地量化'}
            </span>
          </div>
        </Show>
      </div>

      {/* 2. 中部：核心大白话实战解读 */}
      <div class="stock-popover-summary">
        {ai()?.rawSummary || props.comment}
      </div>

      {/* 3. 底部：三行快判清单（均线位置、日线KDJ、支撑阻力） */}
      <div class="stock-checklist">
        <div class="checklist-row">
          <span class="cl-label">均线位置</span>
          <span class="cl-val">
            <Show when={b()?.ma5 != null}>
              <span class="font-mono">MA5: {fmtPrice(b()!.ma5!)}</span>
              <Show when={props.bias5 != null}>
                <span class={`font-mono ${props.bias5! >= 0 ? 'bull' : 'bear'}`} style={{ 'margin-left': '3px' }}>
                  ({fmtSigned(props.bias5!)}%)
                </span>
              </Show>
            </Show>
            <Show when={b()?.ma20 != null}>
              <span class="cl-sep">·</span>
              <span class="font-mono">MA20: {fmtPrice(b()!.ma20!)}</span>
            </Show>
          </span>
        </div>

        <div class="checklist-row">
          <span class="cl-label">日线KDJ</span>
          <span class="cl-val font-mono">
            {kdjText()}
          </span>
        </div>

        <div class="checklist-row">
          <span class="cl-label">支撑阻力</span>
          <span class="cl-val text-truncate" title={levelsText()}>
            {levelsText()}
          </span>
        </div>
      </div>

      {/* 4. 底部刷新与耗时 */}
      <Show when={ai() && props.onRefresh}>
        <div class="stock-popover-footer">
          <span class="quant-model-info">
            耗时 {ai()!.latencyMs ?? '--'}ms
          </span>
          <button
            type="button"
            class="stock-btn-refresh"
            disabled={props.aiLoading}
            onClick={props.onRefresh}
          >
            {props.aiLoading ? '研判中...' : '重新研判'}
          </button>
        </div>
      </Show>
    </div>
  )
}
