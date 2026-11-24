import { For, Show } from 'solid-js'
import './IndexBadge.css'
import { diagnoseIndex } from '../utils/indexDiagnosis'
import { BaseBadge } from './badge'
import { fmtPct, trendClass, type MarketOverview, type Quote, type TrendSignal } from '../types'

export interface IndexBadgeProps {
  quote?: Quote | null
  overview?: MarketOverview | null
  signal?: TrendSignal | null
  compact?: boolean
  showDetails?: boolean
}

/**
 * A股指数专属五维穿透诊断微标 (IndexBadge) - 双列卡片网格布局.
 * 穿透真实赚钱效应、两市量能、主线风格、分时形态与操盘指引.
 *
 * 遵循 AGENTS.md §11：依托通用 BaseBadge 装配，消除冗余，<=300行。
 */
export function IndexBadge(props: IndexBadgeProps) {
  const diag = () => diagnoseIndex(props.quote, props.overview, props.signal)

  const majorIndices = () => {
    const list = props.overview?.indices ?? []
    return list.slice(0, 3)
  }

  return (
    <BaseBadge
      label={props.compact ? diag().compactLabel : diag().badgeLabel}
      shortLabel={props.compact ? undefined : diag().compactLabel}
      tone={diag().tone}
      compact={props.compact}
      showDetails={props.showDetails}
      title={
        props.compact
          ? `${diag().badgeLabel} ${diag().guidance}\n` +
            `${diag().summary}\n` +
            `两市成交: ${diag().totalTurnoverText} (${diag().turnoverDeltaDetail})\n` +
            `全市场: 涨 ${diag().upCount} · 跌 ${diag().downCount} · 平 ${diag().flatCount}`
          : undefined
      }
      popover={(popoverRef) => (
        <div ref={popoverRef} class="index-popover" onWheel={(e) => e.stopPropagation()}>
          {/* 1. 头部：定性大标签 + 操盘指引 */}
          <div class="index-popover-head">
            <span class={`index-badge-title ${diag().tone}`}>{diag().badgeLabel}</span>
            <span class={`index-guidance-pill ${diag().tone}`}>{diag().guidance}</span>
          </div>

          {/* 2. 实况解读简述 */}
          <div class="index-popover-summary">
            {diag().summary}
          </div>

          {/* 3. 涨跌分布红绿条 */}
          <div class="index-breadth-header">
            <span class="breadth-scope-lbl">全市场情绪</span>
            <span class="breadth-scope-counts">
              <span class="breadth-tag up">涨 {diag().upCount} ({diag().upPct}%)</span>
              <span class="sep">·</span>
              <span class="breadth-tag down">跌 {diag().downCount} ({diag().downPct}%)</span>
              <Show when={diag().flatCount > 0}>
                <span class="sep">·</span>
                <span class="breadth-tag flat">平 {diag().flatCount}</span>
              </Show>
            </span>
          </div>
          <div class="index-breadth-row">
            <div class="index-breadth-bar">
              <div class="breadth-fill up" style={{ width: `${diag().upPct}%` }} />
              <div class="breadth-fill down" style={{ width: `${diag().downPct}%` }} />
            </div>
          </div>

          {/* 3.5 黄白线分化分析 (Scissors Spread) */}
          <div class="index-spread-card">
            <div class="spread-card-header">
              <span class="spread-title">⚡ 黄白线分化 (等权 vs 加权)</span>
              <span class={`spread-badge ${diag().yellowWhiteState}`}>
                {diag().yellowWhiteLabel}
              </span>
            </div>
            <div class="spread-card-detail">
              {diag().yellowWhiteDetail}
            </div>
          </div>

          {/* 4. 两列结构卡片 (2-Column Grid Cards) */}
          <div class="index-card-grid">
            {/* 左列：资金与量能 */}
            <div class="index-grid-card">
              <div class="grid-card-title">📊 资金量能</div>
              <div class="grid-card-row">
                <span class="row-lbl">本指成交</span>
                <span class="row-val font-mono">{diag().currentIndexTurnoverText ?? diag().totalTurnoverText}</span>
              </div>
              <div class="grid-card-row" title={diag().turnoverDeltaDetail}>
                <span class="row-lbl">两市总计</span>
                <span class="row-val font-mono text-truncate">
                  {diag().totalTurnoverText}
                </span>
              </div>
            </div>

            {/* 右列：风格与分时 */}
            <div class="index-grid-card">
              <div class="grid-card-title">🧭 市场特征</div>
              <div class="grid-card-row">
                <span class="row-lbl">主线风格</span>
                <span class="row-val style-badge">{diag().styleInfo.badge}</span>
              </div>
              <div class="grid-card-row" title={diag().trendSummary}>
                <span class="row-lbl">分时形态</span>
                <span class="row-val text-truncate">
                  {diag().trendLabel}
                </span>
              </div>
            </div>
          </div>

          {/* 5. 三大指数横向对比单行 */}
          <Show when={majorIndices().length > 0}>
            <div class="index-indices-footer">
              <For each={majorIndices()}>
                {(idx) => (
                  <span class="index-idx-item">
                    <span class="idx-lbl">{idx.name}</span>
                    <span class={`idx-val ${trendClass(idx.changePct)}`}>
                      {fmtPct(idx.changePct)}
                    </span>
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>
      )}
    />
  )
}
