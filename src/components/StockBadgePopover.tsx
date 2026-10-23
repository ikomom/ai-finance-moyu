//! Financial-grade 3-second tactical judgment popover for stock diagnosis.
//!
//! Complies with AGENTS.md §11 (isolated subcomponent, <=300 lines).

import { Show } from 'solid-js'
import { combineBadgeText } from './badge'
import type { StockDiagnosis, StockDiagnosisTone } from '../utils/stockDiagnosis'
import type { StockDecisionResult } from '../types/aiDecision'

export interface StockBadgePopoverProps {
  ref?: (el: HTMLDivElement) => void
  diag: StockDiagnosis
  tone: StockDiagnosisTone
  aiResult?: StockDecisionResult | null
  aiLoading?: boolean
  isLocalOffline?: boolean
  startingService?: boolean
  onStartService?: () => void
  onRefresh?: () => void
}

export function StockBadgePopover(props: StockBadgePopoverProps) {
  const d = () => props.diag
  const ai = () => props.aiResult

  const prefix = () => d().badgeLabel.split(' · ')[0]
  const rawAction = () =>
    (ai()?.actionLabel || d().badgeLabel.split(' · ')[1] || d().guidance).replace(/[【】]/g, '')
  const fullTitle = () => combineBadgeText(prefix(), rawAction(), d().badgeLabel.split(' · ')[1])

  const summaryText = () => ai()?.rawSummary || d().actionSummary

  const intentText = () => {
    if (ai()) {
      return ai()!.isFakePumpLabel
    }
    return d().scoreLabel
  }

  return (
    <div ref={props.ref} class="stock-popover" onWheel={(e) => e.stopPropagation()}>
      {/* 1. 顶部：形态 + 操盘动作大标 + 置信度与模式 */}
      <div class="stock-popover-head">
        <div class="stock-head-left">
          <span class={`stock-badge-title ${props.tone}`}>
            {fullTitle()}
          </span>
        </div>

        <Show when={ai()}>
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
        {summaryText()}
      </div>

      {/* 3. 底部：三行快判清单（诱多风险、均线量能、空间板块） */}
      <div class="stock-checklist">
        <div class="checklist-row">
          <span class="cl-label">诱多风险</span>
          <span class={`cl-val font-mono ${props.tone}`}>{intentText()}</span>
        </div>
        <div class="checklist-row">
          <span class="cl-label">均线量能</span>
          <span class="cl-val">
            <span class={`font-mono ${d().vwapTone}`}>{d().vwapStatusText}</span>
            <span class="cl-sep">·</span>
            <span>盘口{d().imbalanceText}</span>
          </span>
        </div>
        <div class="checklist-row">
          <span class="cl-label">空间板块</span>
          <span class="cl-val text-truncate" title={`${d().spatialText} · ${d().sectorText}`}>
            {d().spatialText} <span class="cl-sep">·</span> {d().sectorText}
          </span>
        </div>
      </div>

      {/* 4. 离线启动提示条 */}
      <Show when={props.isLocalOffline}>
        <div class="stock-offline-strip">
          <span>本地量化服务未启动</span>
          <button
            type="button"
            class="stock-btn-link"
            disabled={props.startingService}
            onClick={props.onStartService}
          >
            {props.startingService ? '正在拉起...' : '一键启动'}
          </button>
        </div>
      </Show>

      {/* 5. 底部刷新与耗时 */}
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
