import { invoke } from '@tauri-apps/api/core'
import type {
  BrokerAccount,
  BrokerFeeConfig,
  ExecuteTradeResult,
  PortfolioSummary,
  TradeOrder,
} from '../types/portfolio'

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('get_portfolio_summary')
}

export async function executeSimulatedTrade(order: TradeOrder): Promise<ExecuteTradeResult> {
  return await invoke<ExecuteTradeResult>('execute_simulated_trade', { order })
}

export async function cancelSimulatedOrder(orderId: string): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('cancel_simulated_order', { orderId })
}

export async function cancelAllSimulatedOrders(brokerId?: string): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('cancel_all_simulated_orders', { brokerId })
}

export async function setPortfolioStrictMode(strictMode: boolean): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('set_portfolio_strict_mode', { strictMode })
}

export async function clearAllPortfolio(): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('clear_all_portfolio')
}

export async function createBrokerAccount(
  name: string,
  initialCash: number,
  feeConfig: BrokerFeeConfig
): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('create_broker_account', {
    name,
    initialCash,
    feeConfig,
  })
}

export async function updateBrokerAccount(broker: BrokerAccount): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('update_broker_account', { broker })
}

export async function deleteBrokerAccount(brokerId: string): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('delete_broker_account', { brokerId })
}

export async function resetBrokerAccount(brokerId: string): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('reset_broker_account', { brokerId })
}

export async function transferBrokerCash(
  brokerId: string,
  amount: number,
  isDeposit: boolean
): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('transfer_broker_cash', {
    brokerId,
    amount,
    isDeposit,
  })
}

export async function resetPortfolioPosition(
  brokerId: string,
  code: string
): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('reset_portfolio_position', {
    brokerId,
    code,
  })
}

export async function setActiveBroker(brokerId: string): Promise<PortfolioSummary> {
  return await invoke<PortfolioSummary>('set_active_broker', { brokerId })
}
