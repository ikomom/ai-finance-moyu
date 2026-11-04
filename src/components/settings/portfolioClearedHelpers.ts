import type { PortfolioPosition, PositionView, TradeRecord } from '../../types/portfolio'

export interface ClearedPositionView {
  brokerId: string
  code: string
  name: string
  totalBuyAmount: number
  totalSellProceeds: number
  realizedPnl: number
  realizedPct: number
  buyTradesCount: number
  sellTradesCount: number
  totalTradesCount: number
  totalFee: number
  clearedAt: string
}

export interface ClearedSummaryStats {
  totalCount: number
  totalRealizedPnl: number
  winCount: number
  lossCount: number
  winRate: number
  totalFee: number
}

export type ClearedSortField = 'pnl' | 'pct' | 'time'
export type SortOrder = 'asc' | 'desc'

/**
 * Aggregates closed positions (holdings with 0 current shares) from the trade ledger.
 */
export function computeClearedPositions(
  trades: TradeRecord[] = [],
  openPositions: (PositionView | PortfolioPosition)[] = [],
  brokerId?: string | null
): ClearedPositionView[] {
  // Collect codes that currently have open holdings (> 0 shares)
  const openCodes = new Set(
    openPositions
      .filter((p) => (!brokerId || p.brokerId === brokerId) && p.shares > 0)
      .map((p) => p.code.toLowerCase())
  )

  // Group filled trades by security code
  const codeTradesMap = new Map<string, TradeRecord[]>()
  for (const t of trades) {
    if (brokerId && t.brokerId !== brokerId) continue
    if (t.status && t.status !== 'Filled') continue
    const cleanCode = t.code.toLowerCase()
    if (openCodes.has(cleanCode)) continue // currently open, not cleared

    const list = codeTradesMap.get(cleanCode) ?? []
    list.push(t)
    codeTradesMap.set(cleanCode, list)
  }

  const results: ClearedPositionView[] = []

  for (const [_, codeTrades] of codeTradesMap) {
    let buyAmount = 0
    let sellProceeds = 0
    let buyCount = 0
    let sellCount = 0
    let feeSum = 0
    let latestSellTime = ''
    const sample = codeTrades[0]

    for (const t of codeTrades) {
      const isBuy = t.action === 'Buy' || (t.action as string) === 'buy'
      const isSell = t.action === 'Sell' || (t.action as string) === 'sell'
      feeSum += t.fee ?? 0

      if (isBuy) {
        buyCount += 1
        buyAmount += t.amount + (t.fee ?? 0)
      } else if (isSell) {
        sellCount += 1
        sellProceeds += t.amount - (t.fee ?? 0)
        if (!latestSellTime || t.timestamp > latestSellTime) {
          latestSellTime = t.timestamp
        }
      }
    }

    // Only include as a cleared position if at least one sell occurred
    if (sellCount === 0) continue

    const pnl = Math.round((sellProceeds - buyAmount) * 100) / 100
    const pct = buyAmount > 0 ? Math.round(((pnl / buyAmount) * 100) * 100) / 100 : 0

    results.push({
      brokerId: sample.brokerId,
      code: sample.code,
      name: sample.name,
      totalBuyAmount: Math.round(buyAmount * 100) / 100,
      totalSellProceeds: Math.round(sellProceeds * 100) / 100,
      realizedPnl: pnl,
      realizedPct: pct,
      buyTradesCount: buyCount,
      sellTradesCount: sellCount,
      totalTradesCount: buyCount + sellCount,
      totalFee: Math.round(feeSum * 100) / 100,
      clearedAt: latestSellTime,
    })
  }

  // Default sort: latest cleared time desc
  results.sort((a, b) => (b.clearedAt > a.clearedAt ? 1 : b.clearedAt < a.clearedAt ? -1 : 0))
  return results
}

/**
 * Computes portfolio-wide summary statistics for all cleared positions.
 */
export function computeClearedSummary(cleared: ClearedPositionView[]): ClearedSummaryStats {
  let totalRealizedPnl = 0
  let winCount = 0
  let lossCount = 0
  let totalFee = 0

  for (const c of cleared) {
    totalRealizedPnl += c.realizedPnl
    totalFee += c.totalFee
    if (c.realizedPnl > 0.001) {
      winCount += 1
    } else if (c.realizedPnl < -0.001) {
      lossCount += 1
    }
  }

  const totalCount = cleared.length
  const winRate = totalCount > 0 ? Math.round(((winCount / totalCount) * 100) * 10) / 10 : 0

  return {
    totalCount,
    totalRealizedPnl: Math.round(totalRealizedPnl * 100) / 100,
    winCount,
    lossCount,
    winRate,
    totalFee: Math.round(totalFee * 100) / 100,
  }
}

/**
 * Sorts cleared positions by user-chosen field and direction.
 */
export function sortClearedPositions(
  list: ClearedPositionView[],
  field: ClearedSortField,
  order: SortOrder
): ClearedPositionView[] {
  const cloned = [...list]
  cloned.sort((a, b) => {
    let diff = 0
    if (field === 'pnl') {
      diff = a.realizedPnl - b.realizedPnl
    } else if (field === 'pct') {
      diff = a.realizedPct - b.realizedPct
    } else if (field === 'time') {
      diff = a.clearedAt.localeCompare(b.clearedAt)
    }
    return order === 'asc' ? diff : -diff
  })
  return cloned
}
