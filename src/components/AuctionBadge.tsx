import { createSignal, Show } from 'solid-js'

import { fmtPct, fmtPrice, fmtSigned, type AuctionData, type Quote } from '../types'

export function AuctionBadge(props: {
  auction?: AuctionData | null
  quote?: Quote | null
  compact?: boolean
  showDetails?: boolean
}) {
  const [hovered, setHovered] = createSignal(false)

  const auc = () => props.auction
  const q = () => props.quote
  const diag = () => auc()?.diagnosis

  const badgeInfo = () => {
    const d = diag()
    const quote = q()

    if (d && d.tag !== 'normal') {
      let icon = '⚡ '
      let tone: 'warn' | 'bull' | 'bear' = 'warn'
      if (d.tag === 'snatching') {
        icon = '▲ '
        tone = 'bull'
      } else if (d.tag === 'dumping') {
        icon = '▼ '
        tone = 'bear'
      } else if (d.tag === 'bear_trap') {
        icon = '⚡ '
        tone = 'bull'
      }
      return {
        label: `${icon}${d.label}`,
        compactLabel: d.label,
        tone,
        detail: d.detail,
        phase: '异动捕捉',
      }
    }

    if (d && d.label) {
      const openPct = d.lockedPct
      const tone: 'bull' | 'bear' | 'neutral' = openPct > 0.05 ? 'bull' : openPct < -0.05 ? 'bear' : 'neutral'
      return {
        label: `竞价 · ${d.label}`,
        compactLabel: d.label,
        tone,
        detail: d.detail,
        phase: '开盘撮合',
      }
    }

    if (quote && quote.open > 0 && quote.preClose > 0) {
      const openPct = ((quote.open - quote.preClose) / quote.preClose) * 100
      const tone: 'bull' | 'bear' | 'neutral' = openPct > 0.05 ? 'bull' : openPct < -0.05 ? 'bear' : 'neutral'
      const labelText = openPct > 0 ? `高开 ${fmtPct(openPct)}` : openPct < 0 ? `低开 ${fmtPct(openPct)}` : '平开 0.00%'
      return {
        label: `竞价 · ${labelText}`,
        compactLabel: labelText,
        tone,
        detail: `09:25 开盘撮合成交价 ${fmtPrice(quote.open)} 元，较昨收${labelText}。早盘竞价撮合已完成。如需监控 09:15-09:25 撤单异动流，请在早盘竞价时段保持软件在线采集。`,
        phase: '开盘撮合',
      }
    }

    return {
      label: '竞价 · 等待申报',
      compactLabel: '等待申报',
      tone: 'neutral' as const,
      detail: '集合竞价监控中，等待早盘 09:15-09:25 申报数据采集...',
      phase: '等待申报',
    }
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
          {/* 头部：竞价状态 + 阶段标识 */}
          <div class="popover-head-simple">
            <span class={`popover-badge-label ${badgeInfo().tone}`}>{badgeInfo().label}</span>
            <span class="popover-score-pill">
              阶段 <b>{badgeInfo().phase}</b>
            </span>
          </div>

          {/* 主体核心：完整展开的诊断解读（绝不截断省略，字号高亮加白） */}
          <div class="popover-comment-body">
            {badgeInfo().detail}
          </div>

          {/* 底部辅助行：核心竞价参数 Pills */}
          <div class="popover-param-strip">
            <Show when={q()?.open && q()!.open > 0}>
              <span class="param-pill">
                <span class="pill-lbl">撮合价</span>
                <span class="pill-val">
                  {fmtPrice(q()!.open)}
                </span>
              </span>
            </Show>

            <Show when={diag()?.earlyPeakPct != null && Math.abs(diag()!.earlyPeakPct) >= 0.1}>
              <span class="param-pill">
                <span class="pill-lbl">前段冲高</span>
                <span class={`pill-val ${diag()!.earlyPeakPct >= 0 ? 'bull' : 'bear'}`}>
                  {fmtSigned(diag()!.earlyPeakPct)}%
                </span>
              </span>
            </Show>

            <Show when={diag()?.lockedPct != null}>
              <span class="param-pill">
                <span class="pill-lbl">定格涨幅</span>
                <span class={`pill-val ${diag()!.lockedPct >= 0 ? 'bull' : 'bear'}`}>
                  {fmtSigned(diag()!.lockedPct)}%
                </span>
              </span>
            </Show>

            <Show when={diag()?.volumeDropPct != null}>
              <span class="param-pill">
                <span class="pill-lbl">撤单降量</span>
                <span class="pill-val warn">
                  {diag()!.volumeDropPct!.toFixed(0)}%
                </span>
              </span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
