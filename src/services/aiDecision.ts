//! Frontend service bridge for System-1 AI Decision Engine (Jev / Laya).
//!
//! Follows AGENTS.md §11 (isolated feature module, typed Tauri IPC).

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { inTauri, logToBackend } from '../tauri'
import type {
  AiDecisionConfig,
  LocalServiceStatus,
  ModelDownloadProgress,
  StockDecisionPayload,
  StockDecisionResult,
} from '../types/aiDecision'

export async function getAiDecisionConfig(): Promise<AiDecisionConfig | null> {
  if (!inTauri()) {
    return {
      mode: 'disabled',
      localPort: 9999,
      localModelId: 'convaiinnovations/laya-multilingual',
      onlineModel: 'typesafe/jev-1.13',
      timeoutSecs: 5,
    }
  }
  try {
    return await invoke<AiDecisionConfig>('get_ai_decision_config')
  } catch (e) {
    logToBackend(`get_ai_decision_config failed: ${e}`)
    return null
  }
}

export async function saveAiDecisionConfig(newCfg: AiDecisionConfig): Promise<boolean> {
  if (!inTauri()) return true
  try {
    await invoke('save_ai_decision_config', { newCfg })
    return true
  } catch (e) {
    logToBackend(`save_ai_decision_config failed: ${e}`)
    return false
  }
}

export async function startLocalDecisionService(
  port?: number
): Promise<LocalServiceStatus> {
  if (!inTauri()) {
    return { running: true, port: port ?? 9999, message: '预览模式: 模拟已启动' }
  }
  return await invoke<LocalServiceStatus>('start_local_decision_service', { port })
}

export async function stopLocalDecisionService(): Promise<LocalServiceStatus> {
  if (!inTauri()) {
    return { running: false, port: 9999, message: '预览模式: 模拟已停止' }
  }
  return await invoke<LocalServiceStatus>('stop_local_decision_service')
}

export async function getLocalServiceStatus(
  port?: number
): Promise<LocalServiceStatus> {
  if (!inTauri()) {
    return { running: false, port: port ?? 9999, message: '预览模式' }
  }
  return await invoke<LocalServiceStatus>('get_local_service_status', { port })
}

export async function downloadDecisionModel(modelId?: string): Promise<string> {
  if (!inTauri()) return '预览模式: 下载成功'
  return await invoke<string>('download_decision_model', { modelId })
}

export async function cancelDownloadDecisionModel(): Promise<boolean> {
  if (!inTauri()) return true
  return await invoke<boolean>('cancel_download_decision_model')
}

export async function getModelDownloadStatus(modelId?: string): Promise<boolean> {
  if (!inTauri()) return false
  return await invoke<boolean>('get_model_download_status', { modelId })
}

export async function openModelsDir(): Promise<void> {
  if (!inTauri()) return
  try {
    await invoke('open_models_dir')
  } catch (e) {
    logToBackend(`open_models_dir failed: ${e}`)
  }
}

export async function decideStockWithAi(
  payload: StockDecisionPayload
): Promise<StockDecisionResult> {
  if (!inTauri()) {
    return {
      code: payload.code,
      mode: 'mock',
      isFakePump: 0.18,
      isFakePumpLabel: '18% (买盘真实)',
      action: 'hold',
      actionLabel: '【持股待涨】',
      actionConfidence: 0.85,
      attribution: 'solo_diverge',
      attributionLabel: '主力资金异动逆势做多',
      latencyMs: 12,
      modelName: 'mock-jev',
      rawSummary: '【模拟】突破形态良好，主力主动扫盘建仓，建议持股待涨。',
    }
  }
  return await invoke<StockDecisionResult>('decide_stock_with_ai', { payload })
}

export async function listenDownloadProgress(
  cb: (p: ModelDownloadProgress) => void
): Promise<UnlistenFn> {
  if (!inTauri()) {
    return () => {}
  }
  return await listen<ModelDownloadProgress>('ai-model-download-progress', (event) => {
    cb(event.payload)
  })
}
