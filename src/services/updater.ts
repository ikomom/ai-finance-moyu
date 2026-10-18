import { check, type Update } from '@tauri-apps/plugin-updater'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'

const SKIPPED_VERSION_KEY = 'moyu_skipped_version'

export interface CheckResult {
  hasUpdate: boolean
  update: Update | null
  currentVersion: string
  newVersion?: string
  date?: string
  body?: string
  isFallback?: boolean
  installerUrl?: string
  installerFileName?: string
  error?: string
}

/**
 * Compare two SemVer strings (e.g. "0.1.1" vs "0.1.0").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareSemVer(a: string, b: string): number {
  const cleanA = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const cleanB = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(cleanA.length, cleanB.length); i++) {
    const numA = cleanA[i] ?? 0
    const numB = cleanB[i] ?? 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }
  return 0
}

export function getSkippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIPPED_VERSION_KEY)
  } catch {
    return null
  }
}

export function setSkippedVersion(version: string): void {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, version)
  } catch {
    // Ignore storage quota or access issues
  }
}

export function clearSkippedVersion(): void {
  try {
    localStorage.removeItem(SKIPPED_VERSION_KEY)
  } catch {
    // Ignore storage quota or access issues
  }
}

/**
 * Check for updates using Tauri v2 plugin-updater,
 * with graceful fallback to GitHub Releases API if plugin fails.
 */
export async function checkAppUpdate(isManual = false): Promise<CheckResult> {
  let currentVersion = '0.1.0'
  try {
    currentVersion = await getVersion()
  } catch {
    // fallback if app version call fails
  }

  const skipped = getSkippedVersion()

  // 1. Try official Tauri updater first
  let update: Awaited<ReturnType<typeof check>> = null
  let tauriErr: unknown = null
  try {
    update = await check({ timeout: 10000 })
  } catch (err) {
    tauriErr = err
    console.warn('[Updater] Tauri plugin updater check failed:', err)
  }

  if (update) {
    if (!isManual && skipped && compareSemVer(update.version, skipped) <= 0) {
      return {
        hasUpdate: false,
        update: null,
        currentVersion,
        newVersion: update.version,
      }
    }
    return {
      hasUpdate: true,
      update,
      currentVersion: update.currentVersion || currentVersion,
      newVersion: update.version,
      date: update.date,
      body: update.body,
    }
  }

  // 2. Fallback to GitHub Releases API via Rust backend (immune to browser CORS/User-Agent quirks)
  let fallbackErr: unknown = null
  try {
    const data = await invoke<{
      tag_name: string
      published_at?: string
      body?: string
      assets?: Array<{ name: string; browser_download_url: string }>
    }>('fetch_latest_release')

    const tagName = (data.tag_name || '').replace(/^v/, '')
    if (tagName && compareSemVer(tagName, currentVersion) > 0) {
      if (!isManual && skipped && compareSemVer(tagName, skipped) <= 0) {
        return {
          hasUpdate: false,
          update: null,
          currentVersion,
          newVersion: tagName,
        }
      }

      const isWin = typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows')
      const isMac =
        typeof navigator !== 'undefined' &&
        (navigator.userAgent.includes('Mac') || (navigator as { platform?: string }).platform?.includes('Mac'))

      const matchedAsset = data.assets?.find((a) => {
        if (isWin) return a.name.endsWith('-setup.exe') || a.name.endsWith('.exe') || a.name.endsWith('.msi')
        if (isMac) return a.name.endsWith('.dmg')
        return false
      })

      return {
        hasUpdate: true,
        update: null,
        currentVersion,
        newVersion: tagName,
        date: data.published_at,
        body: data.body,
        isFallback: true,
        installerUrl: matchedAsset?.browser_download_url,
        installerFileName: matchedAsset?.name,
      }
    } else {
      // Remote server successfully contacted: latest release is <= currentVersion!
      return {
        hasUpdate: false,
        update: null,
        currentVersion,
      }
    }
  } catch (err) {
    fallbackErr = err
    console.warn('[Updater] Fallback GitHub release check failed:', err)
  }

  // If both Tauri updater and GitHub fallback failed:
  if (isManual) {
    const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr || '')
    const tauriMsg = tauriErr instanceof Error ? tauriErr.message : String(tauriErr || '')
    const reason = fallbackMsg || tauriMsg || '无法连接到更新服务器，请检查网络连接'
    throw new Error(`连接更新服务器失败：${reason.replace(/^error:\s*/i, '')}`)
  }

  return {
    hasUpdate: false,
    update: null,
    currentVersion,
  }
}
