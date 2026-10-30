export type AssetClass = 'Stock' | 'ETF' | 'ConvertibleBond'

export type FeePresetId = 'vip_low' | 'preferential' | 'standard' | 'zero' | 'custom'

export const POPULAR_BROKERS = [
  '中国银河',
  '华泰证券',
  '中信证券',
  '招商证券',
  '东方财富',
  '广发证券',
  '国泰君安',
  '平安证券',
]

export const CAPITAL_PRESETS = [100000, 200000, 500000, 1000000]

export interface BrokerFeeConfig {
  preset: string
  stockRate: number
  stockMinFee: number
  etfRate: number
  etfMinFee: number
  bondRate: number
  bondMinFee?: number
  stampDutyRate: number
}

export interface FeePresetMeta {
  id: FeePresetId
  name: string
  badge: string
  desc: string
  config: Omit<BrokerFeeConfig, 'preset'>
}

export const FEE_PRESETS: FeePresetMeta[] = [
  {
    id: 'vip_low',
    name: '低佣VIP (万0.954免五)',
    badge: '极低成本',
    desc: '股票万0.954(最低0.5元) · ETF万0.5(最低0.25元) · 可转债万0.5(最低0.5元) · 印花税万5',
    config: {
      stockRate: 0.0000954,
      stockMinFee: 0.5,
      etfRate: 0.00005,
      etfMinFee: 0.25,
      bondRate: 0.00005,
      bondMinFee: 0.5,
      stampDutyRate: 0.0005,
    },
  },
  {
    id: 'preferential',
    name: '主流优惠 (万1免五)',
    badge: '主流常见',
    desc: '股票万1(免五) · ETF万0.5(免五) · 可转债万0.5(免五) · 印花税万5',
    config: {
      stockRate: 0.0001,
      stockMinFee: 0.0,
      etfRate: 0.00005,
      etfMinFee: 0.0,
      bondRate: 0.00005,
      bondMinFee: 0.0,
      stampDutyRate: 0.0005,
    },
  },
  {
    id: 'standard',
    name: '券商默认 (万2.5最低5元)',
    badge: '官方默认',
    desc: '股票万2.5(最低5元) · ETF万1(最低5元) · 可转债万1(最低1元) · 印花税万5',
    config: {
      stockRate: 0.00025,
      stockMinFee: 5.0,
      etfRate: 0.0001,
      etfMinFee: 5.0,
      bondRate: 0.0001,
      bondMinFee: 1.0,
      stampDutyRate: 0.0005,
    },
  },
  {
    id: 'zero',
    name: '零费率模式 (纯净统计)',
    badge: '无手续费',
    desc: '免除所有佣金与印花税，仅统计纯价格差额',
    config: {
      stockRate: 0.0,
      stockMinFee: 0.0,
      etfRate: 0.0,
      etfMinFee: 0.0,
      bondRate: 0.0,
      bondMinFee: 0.0,
      stampDutyRate: 0.0,
    },
  },
]

export interface BrokerAccount {
  id: string
  name: string
  initialCash: number
  availableCash: number
  feeConfig: BrokerFeeConfig
  createdAt: string
}

export interface PortfolioPosition {
  brokerId: string
  code: string
  name: string
  shares: number
  costPrice: number
  updatedAt: string
}

export type TradeAction = 'Buy' | 'Sell'
export type TradeRecordStatus = 'Filled' | 'Pending' | 'Cancelled' | 'Expired'

export interface TradeRecord {
  id: string
  brokerId: string
  brokerName: string
  code: string
  name: string
  action: TradeAction
  price: number
  shares: number
  amount: number
  fee: number
  realizedPnl?: number | null
  realizedPct?: number | null
  timestamp: string
  status?: TradeRecordStatus
}

export interface TradeOrder {
  brokerId: string
  code: string
  name?: string
  action: TradeAction
  shares: number
  price: number
  preClose?: number
  bids?: [number, number][]
  asks?: [number, number][]
}

export interface PositionView {
  brokerId: string
  brokerName: string
  code: string
  name: string
  shares: number
  availableShares: number
  costPrice: number
  currentPrice: number
  marketValue: number
  floatingPnl: number
  floatingPnlPct: number
  todayPnl: number
  updatedAt: string
}

export interface PendingOrder {
  id: string
  brokerId: string
  brokerName: string
  code: string
  name: string
  action: TradeAction
  price: number
  shares: number
  frozenCash: number
  createdAt: string
}

export interface ExecuteTradeResult {
  summary: PortfolioSummary
  status: 'filled' | 'pending'
  message: string
}

export interface PortfolioSummary {
  activeBrokerId: string | null
  totalEquity: number
  totalMarketValue: number
  totalCash: number
  totalPnl: number
  totalPnlPct: number
  todayPnl: number
  positionRatio: number
  brokers: BrokerAccount[]
  positions: PositionView[]
  trades: TradeRecord[]
  pendingOrders: PendingOrder[]
  strictMode: boolean
}
