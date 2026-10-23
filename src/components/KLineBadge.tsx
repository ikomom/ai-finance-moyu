//! Dual-core tactical judgment badge for daily K-line mode.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

import { KLineBadgePopover } from './KLineBadgePopover'
import { BaseBadge, combineBadgeText } from './badge'
import { useAiDecision } from '../services/useAiDecision'
import type { KLineData, Quote, Snapshot } from '../types'

export interface KLineBadgeProps {
  kline?: KLineData | null
  quote?: Quote | null
  snapshot?: Snapshot | null
  compact?: boolean
  showDetails?: boolean
}

export function KLineBadge(props: KLineBadgeProps) {
  const k = () => props.kline
  const q = () => props.quote
  const lastBar = () => {
    const bars = k()?.bars
    return bars && bars.length > 0 ? bars[bars.length - 1] : null
  }

  const ai = useAiDecision(
    () => props.quote,
    () => props.snapshot,
    () => props.kline,
    'kline'
  )

  const aiResult = () => ai.result()
  const isAiActive = () => ai.isEnabled() && Boolean(aiResult())

  const badgeInfo = () => {
    const data = k()
    if (!data) {
      return {
        prefix: '● 均线',
        action: '加载中',
        fullLabel: '● 均线 · 加载中',
        compactLabel: '均线(加载)',
        tone: 'neutral' as const,
        comment: '正在拉取前复权日K线及均线指标...',
      }
    }

    const b = lastBar()
    const j = b?.j ?? 50
    const m5 = b?.ma5
    const p = q()?.price ?? b?.close ?? 0

    let prefix = '● 均线整理'
    let action = data.klineAction || '蓄势观察'
    let compactLabel = '整理(看)'
    let tone: 'bull' | 'bear' | 'warn' | 'neutral' =
      (data.klineTone as 'bull' | 'bear' | 'warn' | 'neutral') || 'neutral'

    if (j > 100) {
      prefix = '⚡ 日线超买'
      action = '逢高止盈'
      compactLabel = '超买(止盈)'
      tone = 'warn'
    } else if (j < 10) {
      prefix = '★ 日线超卖'
      action = '谨防杀跌'
      compactLabel = '超卖(防杀)'
      tone = 'neutral'
    } else {
      switch (data.maSignal) {
        case 'bull_aligned':
          prefix = '▲ 站稳MA5'
          action = '顺势看多'
          compactLabel = '多头(看多)'
          tone = 'bull'
          break
        case 'above_ma20':
          if (m5 && p < m5) {
            prefix = '▲ 回踩MA5'
            action = '观察支撑'
            compactLabel = '回踩(支撑)'
            tone = 'bull'
          } else {
            prefix = '▲ 站上MA20'
            action = '持股待涨'
            compactLabel = '生命线(持)'
            tone = 'bull'
          }
          break
        case 'below_ma20':
          prefix = '❄️ 承压MA20'
          action = '防守控仓'
          compactLabel = '承压(控仓)'
          tone = 'bear'
          break
        case 'bear_aligned':
          prefix = '❄️ 跌破MA5'
          action = '严格止损'
          compactLabel = '破位(止损)'
          tone = 'bear'
          break
        default:
          prefix = '● 均线整理'
          action = '蓄势观察'
          compactLabel = '整理(观察)'
          tone = 'neutral'
          break
      }
    }

    return {
      prefix,
      action,
      fullLabel: `${prefix} · ${action}`,
      compactLabel,
      tone,
      comment: data.maComment || '日线均线处于平稳运行状态。',
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

  const bias5 = () => {
    const b = lastBar()
    const p = q()?.price ?? b?.close
    if (p && b?.ma5 && b.ma5 > 0) {
      return ((p - b.ma5) / b.ma5) * 100
    }
    return null
  }

  const tone = (): 'bull' | 'bear' | 'warn' | 'neutral' => {
    if (!isAiActive()) return badgeInfo().tone
    const act = aiResult()!.action.toLowerCase()
    if (
      act.includes('buy') ||
      act.includes('hold') ||
      act.includes('support') ||
      act.includes('bounce') ||
      act.includes('做多')
    ) {
      return 'bull'
    }
    if (act.includes('profit') || act.includes('止盈')) return 'warn'
    if (act.includes('loss') || act.includes('stop') || act.includes('止损') || act.includes('清仓')) {
      return 'bear'
    }
    return badgeInfo().tone
  }

  const badgeText = () => {
    if (props.compact) {
      if (isAiActive()) {
        const clean = aiResult()!.actionLabel.replace(/[【】]/g, '')
        const shortAct = clean.slice(0, 2)
        const prefix = badgeInfo().compactLabel.split('(')[0] || badgeInfo().compactLabel
        return `${prefix}(${shortAct})`
      }
      return badgeInfo().compactLabel
    }

    if (isAiActive()) {
      const clean = aiResult()!.actionLabel.replace(/[【】]/g, '')
      return combineBadgeText(badgeInfo().prefix, clean, badgeInfo().action)
    }

    if (ai.isEnabled() && ai.loading()) {
      const prefix = badgeInfo().prefix
      return `${prefix} · 研判中...`
    }

    return badgeInfo().fullLabel
  }

  return (
    <BaseBadge
      label={badgeText()}
      tone={tone()}
      compact={props.compact}
      showDetails={props.showDetails}
      title={props.compact ? `${badgeText()}\n${aiResult()?.rawSummary || badgeInfo().comment}` : undefined}
      popover={(ref) => (
        <KLineBadgePopover
          ref={ref}
          label={isAiActive() ? badgeText().split(' · ')[0] : badgeInfo().prefix}
          action={
            isAiActive()
              ? badgeText().split(' · ')[1] || aiResult()!.actionLabel.replace(/[【】]/g, '')
              : badgeInfo().action
          }
          tone={tone()}
          comment={aiResult()?.rawSummary || badgeInfo().comment}
          lastBar={lastBar()}
          bias20={bias20()}
          bias5={bias5()}
          kdjStatus={k()?.kdjStatus ?? null}
          support={k()?.support ?? null}
          resistance={k()?.resistance ?? null}
          aiResult={aiResult()}
          aiLoading={ai.loading()}
          onRefresh={() => ai.runDecision(true)}
        />
      )}
    />
  )
}
