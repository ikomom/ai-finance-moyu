import { createSignal, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { renderMarkdown } from '../utils/markdown'
import type { CheckResult } from '../services/updater'
import { formatBytes, startUpdateDownload, type DownloadProgress } from './updateDownload'
import './UpdateModal.css'

export type { DownloadProgress }

export interface UpdateModalProps {
  result: CheckResult | null
  currentVersion: string
  isOpen: boolean
  onClose: () => void
  onSkipVersion: (version: string) => void
}
export function UpdateModal(props: UpdateModalProps) {
  const [downloadState, setDownloadState] = createSignal<DownloadProgress>({
    status: 'idle',
    pct: 0,
    downloaded: 0,
    total: 0,
  })

  const releasePageUrl = 'https://github.com/ikomom/ai-finance-moyu/releases/latest'

  const newVersion = () => props.result?.newVersion || props.result?.update?.version || ''
  const releaseDate = () => props.result?.date || props.result?.update?.date || ''
  const changelog = () => props.result?.body || props.result?.update?.body || '本次更新包含性能提升、算法优化及已知问题修复。'

  // Sanitized: the release body is remote, untrusted text rendered via innerHTML.
  const renderedMarkdown = () => renderMarkdown(changelog())

  const handleOpenReleasePage = async () => {
    try {
      await invoke('open_url', { url: releasePageUrl })
    } catch {
      window.open(releasePageUrl, '_blank')
    }
  }

  const handleStartUpdate = async () => {
    const result = props.result
    if (!result) return
    await startUpdateDownload(result, { setProgress: setDownloadState })
  }

  const handleCancelDownload = async () => {
    try {
      await invoke('cancel_package_download')
    } catch {
      // Cancelling a download that already finished is a no-op.
    }
    setDownloadState({ status: 'idle', pct: 0, downloaded: 0, total: 0 })
  }

  const handleSkip = () => {
    props.onSkipVersion(newVersion())
    props.onClose()
  }

  return (
    <Show when={props.isOpen && (props.result?.update || props.result?.hasUpdate)}>
      <div
        class="update-modal-backdrop"
        onClick={async (e) => {
          if (e.target === e.currentTarget) {
            if (downloadState().status === 'downloading') {
              await handleCancelDownload()
            }
            props.onClose()
          }
        }}
      >
        <div class="update-modal-dialog">
          {/* Header */}
          <div class="update-modal-header">
            <div class="update-header-left">
              <span class="update-badge-icon">🚀</span>
              <div class="update-header-titles">
                <div class="update-title-row">
                  <h3 class="update-title">发现新版本 v{newVersion()}</h3>
                  <span class="update-tag-pill">最新发布</span>
                </div>
                <div class="update-subtitle">
                  当前版本: <span class="mono">v{props.currentVersion}</span>
                  <Show when={releaseDate()}>
                    <span class="dot-sep">•</span>
                    <span>发布于 {releaseDate().slice(0, 10)}</span>
                  </Show>
                </div>
              </div>
            </div>
            <button
              type="button"
              class="update-close-btn"
              title={downloadState().status === 'downloading' ? '取消下载并关闭' : '关闭'}
              onClick={async () => {
                if (downloadState().status === 'downloading') {
                  await handleCancelDownload()
                }
                props.onClose()
              }}
            >
              ×
            </button>
          </div>

          {/* Body: Changelog */}
          <div class="update-modal-body">
            <div class="update-changelog-label">更新日志与改进特性：</div>
            <div class="update-changelog-box">
              <div class="update-changelog-markdown" innerHTML={renderedMarkdown()} />
            </div>

            {/* Download Progress Indicator */}
            <Show when={downloadState().status !== 'idle'}>
              <div class="update-progress-card" classList={{ error: downloadState().status === 'error', success: downloadState().status === 'finished' }}>
                <div class="update-progress-info">
                  <span class="progress-status-text">
                    {downloadState().status === 'downloading' && '⚡ 正在下载更新安装包…'}
                    {downloadState().status === 'finished' && '✅ 下载校验完成，正在重启应用…'}
                    {downloadState().status === 'error' && '⚠️ 更新失败：'}
                  </span>
                  <Show when={downloadState().status === 'downloading' && downloadState().total > 0}>
                    <span class="progress-bytes mono">
                      {formatBytes(downloadState().downloaded)} / {formatBytes(downloadState().total)} ({downloadState().pct}%)
                    </span>
                  </Show>
                </div>

                <Show when={downloadState().status === 'downloading'}>
                  <div class="progress-bar-track">
                    <div
                      class="progress-bar-fill"
                      style={{ width: `${downloadState().pct}%` }}
                    />
                  </div>
                </Show>

                <Show when={downloadState().status === 'error'}>
                  <div class="progress-error-detail">
                    {downloadState().error || '网络连接超时或签名校验未通过'}
                    <div class="progress-error-hint">
                      如因国内网络无法直连下载，可点击下方「网页手动下载」获取对应平台安装包覆盖升级。
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          {/* Footer Actions */}
          <div class="update-modal-footer">
            <div class="footer-left-actions">
              <button
                type="button"
                class="btn-sm btn-ghost"
                title="在浏览器中直接打开 GitHub Release 网页下载"
                onClick={() => void handleOpenReleasePage()}
              >
                🌐 网页手动下载
              </button>
              <Show when={downloadState().status !== 'downloading' && downloadState().status !== 'finished'}>
                <button
                  type="button"
                  class="btn-sm btn-ghost btn-muted-text"
                  title="不再提示此版本的更新"
                  onClick={handleSkip}
                >
                  跳过此版本
                </button>
              </Show>
            </div>

            <div class="footer-right-actions">
              <Show when={downloadState().status !== 'downloading' && downloadState().status !== 'finished'}>
                <button
                  type="button"
                  class="btn-sm btn-secondary"
                  onClick={props.onClose}
                >
                  稍后提醒
                </button>
              </Show>

              <Show when={downloadState().status === 'idle' || downloadState().status === 'error'}>
                <button
                  type="button"
                  class="btn-sm btn-primary btn-update-now"
                  onClick={() => void handleStartUpdate()}
                >
                  🚀 立即更新并重启
                </button>
              </Show>

              <Show when={downloadState().status === 'downloading'}>
                <button
                  type="button"
                  class="btn-sm btn-ghost btn-cancel-download"
                  onClick={() => void handleCancelDownload()}
                >
                  取消下载
                </button>
                <button
                  type="button"
                  class="btn-sm btn-primary"
                  disabled
                >
                  <span class="spinner-inline"></span>
                  正在下载 ({downloadState().pct}%)…
                </button>
              </Show>

              <Show when={downloadState().status === 'finished'}>
                <button
                  type="button"
                  class="btn-sm btn-success"
                  disabled
                >
                  重启中…
                </button>
              </Show>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
