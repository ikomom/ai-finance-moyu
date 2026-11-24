//! Financial-grade modern AI opinion card popover for stock diagnosis.
//!
//! Complies with AGENTS.md §11 (isolated subcomponent, <=300 lines).

import { For, Show } from 'solid-js'
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

  // 纯粹 4 字核心操盘大标 (如 "超跌反弹", "逢高止盈", "顺势做多")
  const actionTitle = () => {
    if (ai()?.actionLabel) {
      return ai()!.actionLabel.replace(/[【】]/g, '')
    }
    const parts = d().badgeLabel.split(' ')
    return parts.length > 1 ? parts[1] : d().badgeLabel
  }

  const icon = () => {
    const parts = d().badgeLabel.split(' ')
    return parts.length > 1 ? parts[0] : '●'
  }

  // 1 句精炼的操盘应对洞察（去除口语冗余）
  const insightText = () => {
    const raw = ai()?.rawSummary || d().actionSummary
    const clean = raw.replace(/^(波段[^\s；。]+[；。]\s*)?/, '')
    return clean || raw
  }

  const keyLevelText = () => {
    return d().spatialText
  }

  // 4 项以内紧凑原子化胶囊 (2~4字，零下划线、零emoji、零多重括号)
  const atomicTags = () => {
    const tags: Array<{ label: string; tone: string; title?: string }> = []

    // 1. 核心态势/动作 Tag
    tags.push({ label: actionTitle(), tone: props.tone })

    // 2. 盘口买卖失衡 Tag
    if (d().imbalanceText && !d().imbalanceText.includes('均衡')) {
      tags.push({ label: d().imbalanceText, tone: d().imbalanceTone })
    }

    // 3. 归因 Tag (异动归因或大盘拖累)
    if (d().fallAttribution) {
      tags.push({
        label: d().fallAttribution!.tag,
        tone: d().fallAttribution!.severity === 'danger' ? 'bear' : 'warn',
        title: d().fallAttribution!.reason,
      })
    } else if (ai()?.attributionLabel && ai()!.attributionLabel !== '本地量化' && ai()!.attributionLabel !== '规则量化') {
      tags.push({ label: ai()!.attributionLabel, tone: 'neutral' })
    }

    // 4. 核心行业 Tag（干净名称 + 涨跌幅）
    const secList = d().sectorTags
    if (secList && secList.length > 0) {
      const topSec = secList[0]
      const pctStr = `${topSec.changePct >= 0 ? '+' : ''}${topSec.changePct.toFixed(1)}%`
      tags.push({
        label: `${topSec.name} ${pctStr}`,
        tone: topSec.changePct >= 0 ? 'bull' : 'bear',
        title: topSec.leaderName ? `龙头: ${topSec.leaderName}` : undefined,
      })
    } else if (d().sectorText && d().sectorText !== '个股独立走势') {
      tags.push({ label: d().sectorText, tone: d().sectorTone })
    }

    return tags.slice(0, 4)
  }

  return (
    <div ref={props.ref} class="stock-popover" onWheel={(e) => e.stopPropagation()}>
      {/* 1. 顶部：大字 4 字操盘决断 + 极简等宽置信度 */}
      <div class="stock-popover-head">
        <div class="stock-head-left">
          <span class="stock-head-icon">{icon()}</span>
          <span class={`stock-badge-title ${props.tone}`}>
            {actionTitle()}
          </span>
        </div>

        <div class="stock-quant-meta">
          <Show
            when={ai()}
            fallback={
              <Show when={props.aiLoading}>
                <span class="quant-loading-pill">AI 研判中...</span>
              </Show>
            }
          >
            <span class="quant-conf font-mono">
              {(ai()!.actionConfidence * 100).toFixed(0)}% 置信度
            </span>
          </Show>
        </div>
      </div>

      {/* 2. 中部：AI 精炼研判结论 */}
      <div class="stock-popover-insight">
        <div class="insight-label">AI 研判</div>
        <div class="insight-content">{insightText()}</div>
      </div>

      {/* 3. 关键位置单行对照 */}
      <div class="stock-popover-level">
        <span class="level-label">关键位置</span>
        <span class={`level-val font-mono ${d().spatialTone}`}>{keyLevelText()}</span>
      </div>

      {/* 分割线：清晰界定关键空间位置与特征标签池 */}
      <div class="stock-popover-divider" />

      {/* 4. 底部：原子化紧凑特征胶囊池 */}
      <div class="stock-atomic-pool">
        <For each={atomicTags()}>
          {(tag) => (
            <span class={`atomic-chip ${tag.tone}`} title={tag.title}>
              {tag.label}
            </span>
          )}
        </For>
      </div>

      {/* 5. 离线启动提示条 */}
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

      {/* 6. 底部刷新与毫秒耗时 */}
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
