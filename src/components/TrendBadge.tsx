import { createSignal, Show } from 'solid-js'

import { fmtPct, fmtSigned, isIndexCode, trendClass, type Quote, type TrendSignal } from '../types'

function roleBadgeClass(role: string): string {
  if (role.includes('领涨核心')) return 'role-core'
  if (role.includes('助攻')) return 'role-follow'
  if (role.includes('抗跌')) return 'role-alpha'
  if (role.includes('补跌')) return 'role-drop'
  return 'role-sync'
}

function flowToneClass(ratio?: number): 'bull' | 'bear' | 'neutral' {
  if (ratio == null) return 'neutral'
  if (ratio > 0.55) return 'bull'
  if (ratio < 0.45) return 'bear'
  return 'neutral'
}

function biasToneClass(bias: number): 'bull' | 'bear' | 'neutral' {
  if (bias >= 0.2) return 'bull'
  if (bias <= -0.2) return 'bear'
  return 'neutral'
}

export function TrendBadge(props: {
  signal?: TrendSignal | null
  quote?: Quote | null
  compact?: boolean
  showDetails?: boolean
}) {
  const [hovered, setHovered] = createSignal(false)

  const sig = () => props.signal
  const q = () => props.quote
  const isIdx = () => (props.quote ? isIndexCode(props.quote.code) : false)
  const sec = () => (isIdx() ? null : sig()?.sectorLinkage)

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
            title={
              props.compact
                ? `${s().label} (评分 ${s().score > 0 ? '+' : ''}${s().score})\n` +
                  `${s().summary}\n` +
                  `均线偏离: ${s().biasPct >= 0 ? '+' : ''}${s().biasPct.toFixed(2)}%` +
                  (sec()
                    ? `\n板块: ${sec()!.sectorName} (${fmtPct(sec()!.sectorChangePct)}) [${sec()!.role}]` +
                      (sec()!.leaderName ? ` · 龙头: ${sec()!.leaderName} (${fmtPct(sec()!.leaderChangePct)})` : '') +
                      ` · 超额 ${fmtSigned(sec()!.deltaRSector)}%`
                    : '') +
                  (q()?.bidAskImbalance != null && q()!.bidAskImbalance !== 0
                    ? `\n盘口失衡: ${fmtSigned(q()!.bidAskImbalance! * 100, 0)}% · 主买: ${((q()!.activeBuyRatio ?? 0.5) * 100).toFixed(0)}%`
                    : '')
                : undefined
            }
          >
            {props.compact ? (s().compactLabel || s().label.replace(/^[▲▼⚡●★]\s*/, '')) : s().label}
          </span>

          <Show when={hovered() && (props.showDetails ?? true) && !props.compact}>
            <div class="trend-popover" onWheel={(e) => e.stopPropagation()}>
              {/* 头部：诊断状态 + 评分 */}
              <div class="popover-head-simple">
                <span class={`popover-badge-label ${toneClass()}`}>{s().label}</span>
                <span class="popover-score-pill">
                  评分 <b class={toneClass()}>{s().score > 0 ? `+${s().score}` : s().score}</b>
                </span>
              </div>

              {/* 主体核心：完整展开的评语（绝不截断省略，字号高亮加白） */}
              <div class="popover-comment-body">
                {s().summary}
              </div>

              {/* 底部辅助行：紧凑徽标流 */}
              <div class="popover-param-strip">
                <span class="param-pill">
                  <span class="pill-lbl">VWAP</span>
                  <span class={`pill-val ${biasToneClass(s().biasPct)}`}>
                    {fmtSigned(s().biasPct)}%
                  </span>
                </span>

                <Show when={q()?.activeBuyRatio != null && q()!.activeBuyRatio! > 0}>
                  <span class="param-pill">
                    <span class="pill-lbl">主买</span>
                    <span class={`pill-val ${flowToneClass(q()!.activeBuyRatio)}`}>
                      {(q()!.activeBuyRatio! * 100).toFixed(0)}%
                    </span>
                  </span>
                </Show>

                <Show when={q()?.bidAskImbalance != null && Math.abs(q()!.bidAskImbalance!) >= 0.06}>
                  <span class="param-pill">
                    <span class="pill-lbl">失衡</span>
                    <span class={`pill-val ${q()!.bidAskImbalance! > 0 ? 'bull' : 'bear'}`}>
                      {fmtSigned(q()!.bidAskImbalance! * 100, 0)}%
                      <span class="pill-sub">{q()!.bidAskImbalance! > 0 ? '多' : '空'}</span>
                    </span>
                  </span>
                </Show>

                <Show when={s().orbHigh && s().orbLow}>
                  <span class="param-pill">
                    <span class="pill-lbl">ORB</span>
                    <span class="pill-val orb-range">
                      {s().orbLow!.toFixed(2)}~{s().orbHigh!.toFixed(2)}
                    </span>
                  </span>
                </Show>

                {/* 板块大盘联动（仅个股且非指数） */}
                <Show when={sec() && !isIdx()}>
                  {(() => {
                    const sc = sec()!
                    return (
                      <>
                        <span class="param-pill sector-pill">
                          <span class="pill-lbl">板块</span>
                          <span class="pill-val sector-name">{sc.sectorName}</span>
                          <span class={`pill-val ${trendClass(sc.sectorChangePct)}`}>{fmtPct(sc.sectorChangePct)}</span>
                          <span class={`role-badge ${roleBadgeClass(sc.role)}`}>{sc.role}</span>
                        </span>
                        <Show when={sc.leaderName}>
                          <span class="param-pill leader-pill">
                            <span class="pill-lbl">龙头</span>
                            <span class="pill-val leader-name">{sc.leaderName}</span>
                            <span class={`pill-val ${trendClass(sc.leaderChangePct)}`}>{fmtPct(sc.leaderChangePct)}</span>
                          </span>
                        </Show>
                      </>
                    )
                  })()}
                </Show>
              </div>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}

