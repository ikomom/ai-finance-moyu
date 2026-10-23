//! Shared types for System-1 AI Decision Engine (Jev / Laya).
//!
//! Separated into its own file to maintain the 300-line budget (AGENTS.md §11).

export type AiDecisionMode = 'disabled' | 'local' | 'online'

export interface AiDecisionConfig {
  mode: AiDecisionMode
  localPort: number
  modelsDir?: string | null
  localScriptPath?: string | null
  localModelId: string
  onlineEndpoint?: string | null
  onlineApiKey?: string | null
  onlineModel: string
  timeoutSecs: number
}

export interface ModelDownloadProgress {
  modelId: string
  status: 'downloading' | 'completed' | 'cancelled' | 'error' | string
  downloadedBytes: number
  totalBytes: number
  percent: number
  message?: string | null
}

export interface LocalServiceStatus {
  running: boolean
  port: number
  pid?: number | null
  message: string
}

export interface StockDecisionPayload {
  code: string
  name: string
  price: number
  changePct: number
  vwapBias: number
  activeBuyRatio?: number | null
  bidAskImbalance?: number | null
  spatialDesc: string
  sectorDesc: string
  dailyMaDesc?: string
  dailyKdjDesc?: string
  dailyLevelsDesc?: string
  sectorStyle?: string
  supportDistPct?: number | null
  resistDistPct?: number | null
  ma20DistPct?: number | null
  waveTrend?: string | null
  marketScissorsPct?: number | null
  modeType?: 'intraday' | 'kline'
}

export interface StockDecisionResult {
  code: string
  mode: string
  isFakePump: number
  isFakePumpLabel: string
  action: string
  actionLabel: string
  actionConfidence: number
  attribution: string
  attributionLabel: string
  latencyMs: number
  modelName: string
  rawSummary: string
}
