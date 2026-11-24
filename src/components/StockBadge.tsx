import './StockBadge.css'
import { diagnoseStock, type StockDiagnosisTone } from '../utils/stockDiagnosis'
import { useAiDecision } from '../services/useAiDecision'
import { StockBadgePopover } from './StockBadgePopover'
import { BaseBadge } from './badge'
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

  const aiResult = () => {
    const res = ai.result()
    return res && props.quote?.code && res.code === props.quote.code ? res : null
  }
  const isAiActive = () => ai.isEnabled() && Boolean(aiResult())

  const tone = (): StockDiagnosisTone => {
    if (!isAiActive()) return diag().tone
    const act = aiResult()!.action.toLowerCase()
    if (act.includes('sealed_limit_down') || act.includes('跌停') || act.includes('观望封单')) {
      return 'bear'
    }
    if (act.includes('sealed_limit_up') || act.includes('涨停')) {
      return 'bull'
    }
    if (act.includes('broken_limit') || act.includes('翘板') || act.includes('炸板') || act.includes('资金博弈')) {
      return 'warn'
    }
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
        return clean.slice(0, 2)
      }
      return diag().compactLabel
    }

    if (isAiActive()) {
      const clean = aiResult()!.actionLabel.replace(/[【】]/g, '')
      const icon = diag().badgeLabel.split(' ')[0] || '●'
      return `${icon} ${clean}`
    }

    // 始终零延迟呈现底层确定性量化决策，绝不阻塞显示“研判中...”
    return diag().badgeLabel
  }

  const shortText = () => {
    if (isAiActive()) {
      const clean = aiResult()!.actionLabel.replace(/[【】]/g, '')
      return clean.slice(0, 2)
    }
    return diag().compactLabel
  }

  return (
    <BaseBadge
      label={badgeText()}
      shortLabel={props.compact ? undefined : shortText()}
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
