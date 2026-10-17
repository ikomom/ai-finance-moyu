import { createSignal, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { relaunch } from '@tauri-apps/plugin-process'
import type { Update } from '@tauri-apps/plugin-updater'
import './UpdateModal.css'

export interface DownloadProgress {
  status: 'idle' | 'downloading' | 'finished' | 'error'
  pct: number
  downloaded: number
  total: number
  errorMsg?: string
}

export interface UpdateModalProps {
  update: Update | null
  currentVersion: string
  isOpen: boolean
  onClose: () => void
  onSkipVersion: (version: string) => void
}

function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function UpdateModal(props: UpdateModalProps) {
  const [downloadState, setDownloadState] = createSignal<DownloadProgress>({
    status: 'idle',
    pct: 0,
    downloaded: 0,
    total: 0,
  })

  const releasePageUrl = 'https://github.com/ikomom/ai-finance-moyu/releases/latest'

  const handleOpenReleasePage = async () => {
    try {
      await invoke('open_url', { url: releasePageUrl })
    } catch {
      window.open(releasePageUrl, '_blank')
    }
  }

  const handleStartUpdate = async () => {
    if (!props.update) return
    setDownloadState({
      status: 'downloading',
      pct: 0,
      downloaded: 0,
      total: 0,
    })

    try {
      let downloaded = 0
      let total = 0

      await props.update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0
            setDownloadState({
              status: 'downloading',
              pct: 0,
              downloaded: 0,
              total,
            })
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            const pct = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0
            setDownloadState({
              status: 'downloading',
              pct,
              downloaded,
              total,
            })
            break
          case 'Finished':
            setDownloadState({
              status: 'finished',
              pct: 100,
              downloaded: total || downloaded,
              total: total || downloaded,
            })
            break
        }
      })

      // If download & install finished, trigger relaunch
      setDownloadState((prev) => ({ ...prev, status: 'finished', pct: 100 }))
      setTimeout(async () => {
        try {
          await relaunch()
        } catch {
          // If relaunch fails or on Windows installer exits by itself
        }
      }, 1200)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setDownloadState({
        status: 'error',
        pct: 0,
        downloaded: 0,
        total: 0,
        errorMsg: msg,
      })
    }
  }

  const handleSkip = () => {
    if (props.update?.version) {
      props.onSkipVersion(props.update.version)
    }
    props.onClose()
  }

  return (
    <Show when={props.isOpen && props.update}>
      <div class="update-modal-backdrop" onClick={(e) => {
        if (e.target === e.currentTarget && downloadState().status !== 'downloading') {
          props.onClose()
        }
      }}>
        <div class="update-modal-dialog">
          {/* Header */}
          <div class="update-modal-header">
            <div class="update-header-left">
              <span class="update-badge-icon">🚀</span>
              <div class="update-header-titles">
                <div class="update-title-row">
                  <h3 class="update-title">发现新版本 v{props.update?.version}</h3>
                  <span class="update-tag-pill">最新发布</span>
                </div>
                <div class="update-subtitle">
                  当前版本: <span class="mono">v{props.currentVersion}</span>
                  <Show when={props.update?.date}>
                    <span class="dot-sep">•</span>
                    <span>发布于 {props.update?.date?.slice(0, 10)}</span>
                  </Show>
                </div>
              </div>
            </div>
            <Show when={downloadState().status !== 'downloading'}>
              <button
                type="button"
                class="update-close-btn"
                title="关闭"
                onClick={props.onClose}
              >
                ×
              </button>
            </Show>
          </div>

          {/* Body: Changelog */}
          <div class="update-modal-body">
            <div class="update-changelog-label">更新日志与改进特性：</div>
            <div class="update-changelog-box">
              <pre class="update-changelog-text">
                {props.update?.body?.trim() || '本次更新包含性能提升、算法优化及已知问题修复。'}
              </pre>
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
                    {downloadState().errorMsg || '网络连接超时或签名校验未通过'}
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
