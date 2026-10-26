//! AI Decision Settings Tab (Jev / Laya System-1).
//!
//! Follows AGENTS.md §11 (isolated feature module, <=300 lines).

import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import './AiDecisionTab.css'
import {
  cancelDownloadDecisionModel,
  downloadDecisionModel,
  getAiDecisionConfig,
  getLocalServiceStatus,
  getModelDownloadStatus,
  listenDownloadProgress,
  saveAiDecisionConfig,
  startLocalDecisionService,
  stopLocalDecisionService,
  openModelsDir,
} from '../../services/aiDecision'
import { useSettings } from './SettingsContext'
import { AiLocalCard } from './AiLocalCard'
import { AiOnlineCard } from './AiOnlineCard'
import type {
  AiDecisionConfig,
  AiDecisionMode,
  LocalServiceStatus,
  ModelDownloadProgress,
} from '../../types/aiDecision'

export function AiDecisionTab() {
  const { say } = useSettings()

  const [mode, setMode] = createSignal<AiDecisionMode>('disabled')
  const [localPort, setLocalPort] = createSignal(9999)
  const [modelsDir, setModelsDir] = createSignal('')
  const [localScriptPath, setLocalScriptPath] = createSignal('')
  const [localModelId, setLocalModelId] = createSignal('convaiinnovations/laya-multilingual')
  const [onlineEndpoint, setOnlineEndpoint] = createSignal('https://openrouter.ai/api/alpha/decisions')
  const [onlineApiKey, setOnlineApiKey] = createSignal('')
  const [onlineModel, setOnlineModel] = createSignal('typesafe/jev-1.13')
  const [timeoutSecs, setTimeoutSecs] = createSignal(5)

  const [serviceStatus, setServiceStatus] = createSignal<LocalServiceStatus | null>(null)
  const [modelReady, setModelReady] = createSignal(false)
  const [downloadProgress, setDownloadProgress] = createSignal<ModelDownloadProgress | null>(null)
  const [isDownloading, setIsDownloading] = createSignal(false)
  const [isSaving, setIsSaving] = createSignal(false)

  const refreshStatus = async () => {
    try {
      const s = await getLocalServiceStatus(localPort())
      setServiceStatus(s)
      const ready = await getModelDownloadStatus(localModelId())
      setModelReady(ready)
    } catch {
      // ignore
    }
  }

  onMount(async () => {
    const cfg = await getAiDecisionConfig()
    if (cfg) {
      setMode(cfg.mode)
      setLocalPort(cfg.localPort)
      setModelsDir(cfg.modelsDir || '')
      setLocalScriptPath(cfg.localScriptPath || '')
      setLocalModelId(cfg.localModelId || 'convaiinnovations/laya-multilingual')
      setOnlineEndpoint(cfg.onlineEndpoint || '')
      setOnlineModel(cfg.onlineModel || 'typesafe/jev-1.13')
      setTimeoutSecs(cfg.timeoutSecs || 5)
    }

    await refreshStatus()

    const unlisten = await listenDownloadProgress((p) => {
      setDownloadProgress(p)
      if (p.status === 'downloading') {
        setIsDownloading(true)
      } else if (p.status === 'completed') {
        setIsDownloading(false)
        setModelReady(true)
        say('模型权重已从国内镜像成功就绪！后台正在自动拉起本地服务...', 'ok')
        setTimeout(refreshStatus, 800)
        setTimeout(refreshStatus, 2000)
      } else if (p.status === 'error' || p.status === 'cancelled') {
        setIsDownloading(false)
      }
    })

    onCleanup(() => {
      unlisten()
    })
  })

  const handleSave = async (targetMode?: AiDecisionMode) => {
    if (isSaving()) return
    setIsSaving(true)

    const effectiveMode = targetMode ?? mode()
    const parsedPort = Number(localPort())
    const clampedPort = isNaN(parsedPort) ? 9999 : Math.min(65535, Math.max(1024, parsedPort))
    setLocalPort(clampedPort)

    const payload: AiDecisionConfig = {
      mode: effectiveMode,
      localPort: clampedPort,
      modelsDir: modelsDir().trim() || null,
      localScriptPath: localScriptPath().trim() || null,
      localModelId: localModelId().trim() || 'convaiinnovations/laya-multilingual',
      onlineEndpoint: onlineEndpoint().trim() || null,
      onlineApiKey: onlineApiKey().trim() || null,
      onlineModel: onlineModel().trim() || 'typesafe/jev-1.13',
      timeoutSecs: Number(timeoutSecs()) || 5,
    }

    try {
      const ok = await saveAiDecisionConfig(payload)
      if (ok) {
        say(
          `AI决策配置已保存 (${effectiveMode === 'local' ? '本地服务' : effectiveMode === 'online' ? '线上API' : '已停用'})`,
          'ok'
        )
        await refreshStatus()
        if (effectiveMode === 'local') {
          setTimeout(refreshStatus, 800)
          setTimeout(refreshStatus, 2000)
        }
      } else {
        say('保存 AI 决策配置失败', 'bad')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleSelectMode = async (m: AiDecisionMode) => {
    setMode(m)
    await handleSave(m)
  }

  const handleStartLocal = async () => {
    say('正在保存配置并拉起本地模型决策进程…')
    await handleSave('local')
    try {
      const s = await startLocalDecisionService(Number(localPort()) || 9999)
      setServiceStatus(s)
      if (s.running) {
        say(`本地决策服务已成功启动并在端口 ${s.port} 监听`, 'ok')
      } else {
        say(`启动服务失败: ${s.message}`, 'bad')
      }
    } catch (e) {
      say(`启动服务异常: ${e}`, 'bad')
    }
  }

  const handleStopLocal = async () => {
    const s = await stopLocalDecisionService()
    setServiceStatus(s)
    say('本地决策服务已停止并释放端口', 'ok')
  }

  const handleStartDownload = async () => {
    setIsDownloading(true)
    say('开始从国内镜像 (hf-mirror) 下载模型权重…')
    try {
      await downloadDecisionModel(localModelId())
    } catch (e) {
      setIsDownloading(false)
      say(`下载模型失败: ${e}`, 'bad')
    }
  }

  const handleCancelDownload = async () => {
    await cancelDownloadDecisionModel()
    setIsDownloading(false)
    say('已发送取消下载信号', 'ok')
  }

  const handleOpenDir = async () => {
    await openModelsDir()
    say('已在资源管理器中打开模型目录', 'ok')
  }

  return (
    <div class="tab-pane">
      {/* 1. 决策模式互斥选择 */}
      <div class="card">
        <div class="card-title-row">
          <h2>
            <span class="title-icon">🤖</span>
            <span>AI 决策引擎模式 (Jev / Laya System-1)</span>
          </h2>
          <span class="card-badge">双路严格互斥</span>
        </div>
        <p class="hint">
          穿透大盘与盘口异动，极速研判主力诱多嫌疑、操盘动作建议与走势归因。选择线上服务时自动停止本地进程释放端口。
        </p>

        <div class="ai-mode-selector">
          <div
            class={`ai-mode-option ${mode() === 'disabled' ? 'active' : ''}`}
            onClick={() => void handleSelectMode('disabled')}
          >
            <div class="ai-mode-head">
              <span>🚫</span>
              <span>停用 AI 决策</span>
            </div>
            <div class="ai-mode-desc">仅保留内置传统指标，不启用大模型研判</div>
          </div>

          <div
            class={`ai-mode-option ${mode() === 'local' ? 'active' : ''}`}
            onClick={() => void handleSelectMode('local')}
          >
            <div class="ai-mode-head">
              <span>💻</span>
              <span>本地模型服务</span>
            </div>
            <div class="ai-mode-desc">自设独立端口运行 Laya 本地模型，隐私零泄露</div>
          </div>

          <div
            class={`ai-mode-option ${mode() === 'online' ? 'active' : ''}`}
            onClick={() => void handleSelectMode('online')}
          >
            <div class="ai-mode-head">
              <span>☁️</span>
              <span>线上模型服务</span>
            </div>
            <div class="ai-mode-desc">直连兼容 OpenAI 规范的 Jev / OpenRouter 接口</div>
          </div>
        </div>
      </div>

      {/* 2. 本地模型配置面板 */}
      <Show when={mode() === 'local'}>
        <AiLocalCard
          localPort={localPort}
          setLocalPort={setLocalPort}
          localModelId={localModelId}
          setLocalModelId={setLocalModelId}
          modelsDir={modelsDir}
          setModelsDir={setModelsDir}
          serviceStatus={serviceStatus}
          modelReady={modelReady}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          onStartLocal={handleStartLocal}
          onStopLocal={handleStopLocal}
          onStartDownload={handleStartDownload}
          onCancelDownload={handleCancelDownload}
          onOpenDir={handleOpenDir}
          onSave={() => handleSave()}
        />
      </Show>

      {/* 3. 线上模型配置面板 */}
      <Show when={mode() === 'online'}>
        <AiOnlineCard
          onlineEndpoint={onlineEndpoint}
          setOnlineEndpoint={setOnlineEndpoint}
          onlineApiKey={onlineApiKey}
          setOnlineApiKey={setOnlineApiKey}
          onlineModel={onlineModel}
          setOnlineModel={setOnlineModel}
          onSave={() => handleSave()}
        />
      </Show>
    </div>
  )
}
