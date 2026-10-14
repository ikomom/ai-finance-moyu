import { createSignal, Show } from 'solid-js'

import { fmtPrice, fmtSigned, type KLineData, type Quote } from '../types'

export interface KLineBadgeProps {
  kline?: KLineData | null
  quote?: Quote | null
  compact?: boolean
  showDetails?: boolean
}

export function KLineBadge(props: KLineBadgeProps) {
  const [hovered, setHovered] = createSignal(false)

  const k = () => props.kline
  const q = () => props.quote
  const lastBar = () => {
    const bars = k()?.bars
    return bars && bars.length > 0 ? bars[bars.length - 1] : null
  }

  const badgeInfo = () => {
    const data = k()
    if (!data) {
      return {
        label: '日K · 均线',
        compactLabel: '均线',
        tone: 'neutral' as const,
        phase: '数据加载中',
        detail: '正在拉取前复权日K线及均线指标...',
      }
    }

    let tone: 'bull' | 'bear' | 'neutral' = 'neutral'
    let label = '均线整理'

    switch (data.maSignal) {
      case 'bull_aligned':
        tone = 'bull'
        label = '多头排列'
        break
      case 'above_ma20':
        tone = 'bull'
        label = '站上MA20'
        break
      case 'below_ma20':
        tone = 'bear'
        label = '承压MA20'
        break
      case 'bear_aligned':
        tone = 'bear'
        label = '空头排列'
        break
      default:
        tone = 'neutral'
        label = '均线整理'
        break
    }

    return {
      label: `日K · ${label}`,
      compactLabel: label,
      tone,
      phase: '日线均线形态',
      detail: data.maComment || '日线均线处于平稳运行状态。',
    }
  }

  const bias20 = () => {
    const b = lastBar()
    const p = q()?.price ?? b?.close
    if (p && b?.ma20 && b.ma20 > 0) {
      return ((p - b.ma20) / b.ma20) * 100
    }
    return null
  }

  return (
    <div
      class={`trend-badge-wrap ${props.compact ? 'compact' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        class={`trend-badge ${badgeInfo().tone}`}
        title={props.compact ? `${badgeInfo().label}\n${badgeInfo().detail}` : undefined}
      >
        {props.compact ? badgeInfo().compactLabel : badgeInfo().label}
      </span>

      <Show when={hovered() && (props.showDetails ?? true) && !props.compact}>
        <div class="trend-popover" onWheel={(e) => e.stopPropagation()}>
          {/* 头部：徽标状态 + 阶段标识 */}
          <div class="popover-head-simple">
            <span class={`popover-badge-label ${badgeInfo().tone}`}>{badgeInfo().label}</span>
            <span class="popover-score-pill">
              维度 <b>{badgeInfo().phase}</b>
            </span>
          </div>

          {/* 主体核心：完整展开的均线诊断评价 */}
          <div class="popover-comment-body">
            {badgeInfo().detail}
          </div>

          {/* 底部辅助行：MA5/MA10/MA20 与 Bias20 参数 Pills */}
          <div class="popover-param-strip">
            <Show when={lastBar()?.ma5 != null}>
              <span class="param-pill">
                <span class="pill-lbl">MA5</span>
                <span class="pill-val warn">
                  {fmtPrice(lastBar()!.ma5!)}
                </span>
              </span>
            </Show>

            <Show when={lastBar()?.ma10 != null}>
              <span class="param-pill">
                <span class="pill-lbl">MA10</span>
                <span class="pill-val" style={{ color: '#c084fc' }}>
                  {fmtPrice(lastBar()!.ma10!)}
                </span>
              </span>
            </Show>

            <Show when={lastBar()?.ma20 != null}>
              <span class="param-pill">
                <span class="pill-lbl">MA20</span>
                <span class="pill-val" style={{ color: '#38bdf8' }}>
                  {fmtPrice(lastBar()!.ma20!)}
                </span>
              </span>
            </Show>

            <Show when={bias20() != null}>
              <span class="param-pill">
                <span class="pill-lbl">20日乖离</span>
                <span class={`pill-val ${bias20()! >= 0 ? 'bull' : 'bear'}`}>
                  {fmtSigned(bias20()!)}%
                </span>
              </span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
