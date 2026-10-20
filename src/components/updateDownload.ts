//! Installer download / launch logic for the update dialog.
//!
//! Extracted from `UpdateModal.tsx` so that component stays focused on layout
//! (and both files stay inside the 300-line budget, AGENTS.md §11). The flow is
//! unchanged: the signed Tauri updater is preferred, and the backend's streamed
//! download is only used for the GitHub-API fallback path — which is exactly why
//! that command validates the host and the file extension.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { relaunch } from '@tauri-apps/plugin-process'

import type { CheckResult } from '../services/updater'

export interface DownloadProgress {
  status: 'idle' | 'downloading' | 'finished' | 'error'
  pct: number
  downloaded: number
  total: number
  error?: string
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const IDLE: DownloadProgress = { status: 'idle', pct: 0, downloaded: 0, total: 0 }

export interface DownloadCallbacks {
  setProgress: (next: DownloadProgress) => void
}

/**
 * Run the whole "download then install" flow for a discovered release.
 *
 * Resolves when the flow finished (or failed with the error already reported
 * through `setProgress`).
 */
export async function startUpdateDownload(
  result: CheckResult,
  cb: DownloadCallbacks
): Promise<void> {
  const { setProgress } = cb
  setProgress({ status: 'downloading', pct: 0, downloaded: 0, total: 0 })

  if (result.update) {
    try {
      let downloaded = 0
      let total = 0

      await result.update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0
            setProgress({ status: 'downloading', pct: 0, downloaded: 0, total })
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            setProgress({
              status: 'downloading',
              pct: total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
              downloaded,
              total,
            })
            break
          case 'Finished':
            setProgress({
              status: 'finished',
              pct: 100,
              downloaded: total || downloaded,
              total: total || downloaded,
            })
            break
        }
      })

      setProgress({ status: 'finished', pct: 100, downloaded, total })
      // The installer usually terminates the app itself; relaunch is the
      // fallback for builds where it does not.
      setTimeout(() => {
        void relaunch().catch(() => {
          // Expected on most installs: the new build is already starting.
        })
      }, 1200)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setProgress({ ...IDLE, status: 'error', error: message })
    }
    return
  }

  // Fallback: streamed download through the Rust backend.
  const targetVersion = result.newVersion || 'latest'
  const fallbackUrl =
    `https://github.com/ikomom/ai-finance-moyu/releases/download/v${targetVersion}` +
    `/ai-finance-moyu_${targetVersion}_x64-setup.exe`
  const url = result.installerUrl || fallbackUrl
  const filename = result.installerFileName || `ai-finance-moyu_${targetVersion}_x64-setup.exe`

  try {
    const unlistenProgress = await listen<{ downloaded: number; total: number; pct: number }>(
      'installer-download-progress',
      (event) => {
        const { downloaded, total, pct } = event.payload
        setProgress({
          status: pct >= 100 ? 'finished' : 'downloading',
          pct,
          downloaded,
          total,
        })
      }
    )

    try {
      await invoke('download_and_install_package', { url, filename })
    } finally {
      unlistenProgress()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('下载已取消')) {
      setProgress(IDLE)
      return
    }
    setProgress({ ...IDLE, status: 'error', error: message })
  }
}
