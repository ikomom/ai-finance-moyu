import { createSignal, Show } from 'solid-js'

import type { TrendSignal } from '../types'

export function TrendBadge(props: {
  signal?: TrendSignal | null
  compact?: boolean
  showDetails?: boolean
}) {
  const [hovered, setHovered] = createSignal(false)

  const sig = () => props.signal

  const toneClass = () => {
    const s = sig()
    if (!s) return 'neutral'
    if (s.state === 'vwapOverbought' || s.state === 'vwapOversold') return 'warn'
    if (s.score >= 30) return 'bull'
    if (s.score <= -30) return 'bear'
    return 'neutral'
  }

  return (
    <Show when={sig()}>
      {(s) => (
        <div
          class={`trend-badge-wrap ${props.compact ? 'compact' : ''}`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <span
            class={`trend-badge ${toneClass()}`}
            title={props.compact ? `${s().label}: ${s().summary} (评分 ${s().score > 0 ? '+' : ''}${s().score}, 均线偏离 ${s().biasPct >= 0 ? '+' : ''}${s().biasPct.toFixed(2)}%)` : undefined}
          >
            {props.compact ? (s().compactLabel || s().label.replace(/^[▲▼⚡●]\s*/, '')) : s().label}
          </span>

          <Show when={hovered() && (props.showDetails ?? true) && !props.compact}>
            <div class="trend-popover" onWheel={(e) => e.stopPropagation()}>
              <div class="trend-popover-head">
                <span class={`trend-popover-title ${toneClass()}`}>{s().label}</span>
                <span class="trend-popover-score">
                  评分 <b class={toneClass()}>{s().score > 0 ? `+${s().score}` : s().score}</b>
                </span>
              </div>

              <div class="trend-score-bar">
                <div class="score-track">
                  <div
                    class={`score-fill ${toneClass()}`}
                    style={{
                      width: `${Math.min(100, Math.max(10, Math.abs(s().score)))}%`,
                    }}
                  />
                </div>
              </div>

              <div class="trend-popover-row">
                <span class="lbl">均线乖离 (VWAP)</span>
                <span class={`val ${s().biasPct >= 0 ? 'bull' : 'bear'}`}>
                  {s().biasPct >= 0 ? `+${s().biasPct.toFixed(2)}%` : `${s().biasPct.toFixed(2)}%`}
                </span>
              </div>

              <div class="trend-popover-summary">{s().summary}</div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}
