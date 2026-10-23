import './StockBadge.css'
import { diagnoseStock, type StockDiagnosisTone } from '../utils/stockDiagnosis'
import { useAiDecision } from '../services/useAiDecision'
import { StockBadgePopover } from './StockBadgePopover'
import { BaseBadge, combineBadgeText } from './badge'
import type { Quote, Snapshot, TrendSignal } from '../types'

export interface StockBadgeProps {
  quote?: Quote | null
  signal?: TrendSignal | null
  snapshot?: Snapshot | null
  compact?: boolean
  showDetails?: boolean
}

/**
 * A股个股专属实战操盘穿透诊断与量化决断微标 (StockBadge).
 *
 * 遵循 AGENTS.md §11：依托通用 BaseBadge 装配，消除冗余，<=300行。
 */
export function StockBadge(props: StockBadgeProps) {
  const diag = () => diagnoseStock(props.quote, props.signal)

  const ai = useAiDecision(
    () => props.quote,
    () => props.snapshot
  )

  const aiResult = () => ai.result()
  const isAiActive = () => ai.isEnabled() && Boolean(aiResult())

  const tone = (): StockDiagnosisTone => {
    if (!isAiActive()) return diag().tone
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
    return 'warn'
  }

  const badgeText = () => {
    if (props.compact) {
      if (isAiActive()) {
        const clean = aiResult()!.actionLabel.replace(/[【】]/g, '')
        const shortAct = clean.slice(0, 2)
        const prefix = diag().compactLabel.split('(')[0] || diag().compactLabel
        return `${prefix}(${shortAct})`
      }
      return diag().compactLabel
    }

    if (isAiActive()) {
      const clean = aiResult()!.actionLabel.replace(/[【】]/g, '')
      const prefix = diag().badgeLabel.split(' · ')[0]
      return combineBadgeText(prefix, clean, diag().badgeLabel.split(' · ')[1])
    }

    if (ai.isEnabled() && ai.loading()) {
      const prefix = diag().badgeLabel.split(' · ')[0]
      return `${prefix} · 研判中...`
    }

    return diag().badgeLabel
  }

  return (
    <BaseBadge
      label={badgeText()}
      tone={tone()}
      compact={props.compact}
      showDetails={props.showDetails}
      title={props.compact ? `${badgeText()} · ${diag().actionSummary}` : undefined}
      popover={(ref) => (
        <StockBadgePopover
          ref={ref}
          diag={diag()}
          tone={tone()}
          aiResult={aiResult()}
          aiLoading={ai.loading()}
          isLocalOffline={ai.isLocalOffline()}
          startingService={ai.startingService()}
          onStartService={ai.startLocalService}
          onRefresh={() => ai.runDecision(true)}
        />
      )}
    />
  )
}

/**
 * 向后兼容别名 TrendBadge = StockBadge
 */
export const TrendBadge = StockBadge
