//! Local Model Service management card.
//!
//! Subcomponent extracted from AiDecisionTab to observe AGENTS.md §11 (<300 lines).

import { Show, type Accessor, type Setter } from 'solid-js'
import type { LocalServiceStatus, ModelDownloadProgress } from '../../types/aiDecision'

export interface AiLocalCardProps {
  localPort: Accessor<number>
  setLocalPort: Setter<number>
  localModelId: Accessor<string>
  setLocalModelId: Setter<string>
  modelsDir: Accessor<string>
  setModelsDir: Setter<string>
  serviceStatus: Accessor<LocalServiceStatus | null>
  modelReady: Accessor<boolean>
  isDownloading: Accessor<boolean>
  downloadProgress: Accessor<ModelDownloadProgress | null>
  onStartLocal: () => Promise<void>
  onStopLocal: () => Promise<void>
  onStartDownload: () => Promise<void>
  onCancelDownload: () => Promise<void>
  onOpenDir: () => Promise<void>
  onSave: () => Promise<void>
}

export function AiLocalCard(props: AiLocalCardProps) {
  return (
    <div class="card">
      <div class="card-title-row">
        <h2>
          <span class="title-icon">💻</span>
          <span>本地模型与端口服务管理</span>
        </h2>
        <div class="ai-status-indicator">
          <span class={`ai-status-dot ${props.serviceStatus()?.running ? 'active' : ''}`} />
          <span style={{ 'font-size': '12px' }}>
            {props.serviceStatus()?.running
              ? `监听中 (端口 ${props.serviceStatus()?.port})`
              : '未运行'}
          </span>
        </div>
      </div>

      <div class="ai-grid-fields">
        <div class="field">
          <label>服务监听端口</label>
          <input
            type="number"
            value={props.localPort()}
            onInput={(e) => props.setLocalPort(Number(e.currentTarget.value))}
            placeholder="默认 8000"
          />
        </div>
        <div class="field">
          <label>模型权重标识</label>
          <input
            type="text"
            value={props.localModelId()}
            onInput={(e) => props.setLocalModelId(e.currentTarget.value)}
            placeholder="convaiinnovations/laya-multilingual"
          />
        </div>
      </div>

      <div class="field" style={{ 'margin-top': '8px' }}>
        <label>自定义模型存储目录 (留空使用默认 %APPDATA%/models)</label>
        <input
          type="text"
          value={props.modelsDir()}
          onInput={(e) => props.setModelsDir(e.currentTarget.value)}
          placeholder="留空自动存放于系统 AppData 目录"
        />
      </div>

      {/* 模型就绪与下载区 */}
      <div class="ai-status-banner" style={{ 'margin-top': '10px' }}>
        <div>
          <span>模型状态：</span>
          <strong style={{ color: props.modelReady() ? '#34d399' : '#fbbf24' }}>
            {props.modelReady() ? '权重已就绪' : '未检测到完整权重'}
          </strong>
        </div>
        <div class="ai-btn-group" style={{ margin: 0 }}>
          <Show
            when={!props.isDownloading()}
            fallback={
              <button
                type="button"
                class="btn-ghost"
                onClick={() => void props.onCancelDownload()}
              >
                取消下载
              </button>
            }
          >
            <button
              type="button"
              class="btn-primary"
              onClick={() => void props.onStartDownload()}
            >
              {props.modelReady() ? '重新校验/加速下载' : '从国内镜像下载 (魔搭高速通道)'}
            </button>
            <button
              type="button"
              class="btn-ghost"
              title="在文件资源管理器中打开模型存储目录"
              onClick={() => void props.onOpenDir()}
            >
              📁 打开目录
            </button>
          </Show>
        </div>
      </div>

      <Show when={props.isDownloading() && props.downloadProgress()}>
        <div class="ai-download-progress-container">
          <div class="ai-download-info-row">
            <span>{props.downloadProgress()!.message || '正在下载...'}</span>
            <span>{props.downloadProgress()!.percent}%</span>
          </div>
          <div class="ai-download-bar-track">
            <div
              class="ai-download-bar-fill"
              style={{ width: `${props.downloadProgress()!.percent}%` }}
            />
          </div>
          <div class="ai-download-info-row">
            <span>
              {(props.downloadProgress()!.downloadedBytes / (1024 * 1024)).toFixed(1)} MB /{' '}
              {(props.downloadProgress()!.totalBytes / (1024 * 1024)).toFixed(1)} MB
            </span>
            <span>高速加速通道: ModelScope (阿里) + HF (断点续传)</span>
          </div>
        </div>
      </Show>

      {/* 本地进程控制 */}
      <div class="ai-btn-group">
        <Show
          when={props.serviceStatus()?.running}
          fallback={
            <button
              type="button"
              class="btn-primary"
              onClick={() => void props.onStartLocal()}
            >
              启动本地决策服务
            </button>
          }
        >
          <button
            type="button"
            class="btn-ghost"
            onClick={() => void props.onStopLocal()}
          >
            停止本地服务 (释放端口)
          </button>
        </Show>
        <button type="button" class="btn-ghost" onClick={() => void props.onSave()}>
          保存配置
        </button>
      </div>
    </div>
  )
}
