import type { BrokerFeeConfig, PortfolioPosition, PositionView, TradeAction } from '../../types/portfolio'

export interface EstimatedFee {
  commission: number
  stampDuty: number
  total: number
}

export function estimateTradeFee(
  code: string,
  action: TradeAction,
  price: number,
  shares: number,
  feeConfig?: BrokerFeeConfig
): EstimatedFee {
  if (!feeConfig || price <= 0 || shares <= 0) {
    return { commission: 0, stampDuty: 0, total: 0 }
  }
  const c = code.toLowerCase()
  const isCb = c.startsWith('sh11') || c.startsWith('sz12')
  const isEtf = c.startsWith('sh5') || c.startsWith('sz15') || c.startsWith('sz16')
  const rate = isEtf
    ? (feeConfig.etfRate ?? 0.00005)
    : isCb
      ? (feeConfig.bondRate ?? 0.00005)
      : (feeConfig.stockRate ?? 0.0001)
  const minFee = isEtf
    ? (feeConfig.etfMinFee ?? 0)
    : isCb
      ? (feeConfig.bondMinFee ?? 0)
      : (feeConfig.stockMinFee ?? 0)

  const comm = Math.round(Math.max(price * shares * rate, minFee) * 100) / 100
  const stamp =
    action === 'Sell' && !isEtf && !isCb
      ? Math.round(price * shares * (feeConfig.stampDutyRate ?? 0.0005) * 100) / 100
      : 0
  return {
    commission: comm,
    stampDuty: stamp,
    total: Math.round((comm + stamp) * 100) / 100,
  }
}

export function getAvailableSellShares(
  pos?: PositionView | PortfolioPosition,
  strictMode = true
): number {
  if (!pos || pos.shares <= 0) return 0
  if (strictMode && 'availableShares' in pos && typeof pos.availableShares === 'number') {
    return pos.availableShares
  }
  return pos.shares
}

export function computeSharesByRatio(
  action: TradeAction,
  ratio: number,
  availableCash: number,
  price: number,
  pos?: PositionView | PortfolioPosition,
  strictMode = true
): number {
  if (price <= 0) return 0
  if (action === 'Buy') {
    const avail = availableCash * ratio
    const rawShares = Math.floor(avail / (price * 1.0003) / 100) * 100
    return Math.max(0, rawShares)
  }
  const maxSell = getAvailableSellShares(pos, strictMode)
  if (maxSell <= 0) return 0
  if (ratio >= 1.0) {
    return maxSell
  }
  const rawShares = Math.floor((maxSell * ratio) / 100) * 100
  return rawShares > 0 ? rawShares : (maxSell < 100 ? maxSell : 0)
}

export function computeOrderBookDepthHint(
  action: TradeAction,
  shares: number,
  asks?: [number, number][]
): { vol: number; ratio: number; isExceeded: boolean } | null {
  if (action !== 'Buy' || !asks || asks.length === 0) return null
  const ask1 = asks[0]
  if (!ask1 || ask1[1] <= 0) return null
  const ask1Shares = ask1[1] * 100
  const ratio = Math.round((shares / ask1Shares) * 100)
  return {
    vol: ask1[1],
    ratio,
    isExceeded: ratio > 50,
  }
}

export function formatSharesDisplay(shares: number): string {
  if (shares <= 0) return '0'
  if (shares >= 100000000) {
    return `${(shares / 100000000).toFixed(2).replace(/\.?0+$/, '')}亿`
  }
  if (shares >= 10000) {
    return `${(shares / 10000).toFixed(1).replace(/\.?0+$/, '')}万`
  }
  return shares.toLocaleString()
}

export function isPendingLimitOrder(
  action: TradeAction,
  price: number,
  currentPrice: number,
  bids?: [number, number][],
  asks?: [number, number][]
): boolean {
  if (price <= 0) return false
  if (action === 'Buy') {
    const ask1 = asks && asks.length > 0 && asks[0][0] > 0 ? asks[0][0] : currentPrice
    return ask1 > 0 && price < ask1
  } else {
    const bid1 = bids && bids.length > 0 && bids[0][0] > 0 ? bids[0][0] : currentPrice
    return bid1 > 0 && price > bid1
  }
}
