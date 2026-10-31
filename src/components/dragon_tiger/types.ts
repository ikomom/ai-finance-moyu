export interface DragonTigerSeat {
  branch_name: string
  trader_label: string | null
  buy_amount: number
  sell_amount: number
  net_amount: number
}

export interface StockDragonTiger {
  code: string
  name: string
  trade_date: string
  reason: string
  close_price: number
  change_pct: number
  net_total: number
  institution_buy: number
  institution_sell: number
  institution_net: number
  top_buyers: DragonTigerSeat[]
  top_sellers: DragonTigerSeat[]
}

export interface StockDetailInfo {
  code: string
  dragon_tiger: StockDragonTiger | null
}

export interface MarketLhbStockItem {
  code: string
  name: string
  price: number
  change_pct: number
  institution_net: number
  net_total: number
}

export interface FamousTraderMove {
  trader_name: string
  stock_code: string
  stock_name: string
  action: string
  net_amount: number
}

export interface MarketDragonTigerOverview {
  trade_date: string
  top_institution_stocks: MarketLhbStockItem[]
  famous_trader_moves: FamousTraderMove[]
}

export interface SeatOperationItem {
  code: string
  name: string
  trade_date: string
  buy_amount: number
  sell_amount: number
  net_amount: number
  close_price: number
  change_pct: number
  reason: string
}

export interface SeatDetailInfo {
  branch_name: string
  trader_label: string | null
  same_day_operations: SeatOperationItem[]
  historical_operations: SeatOperationItem[]
}
