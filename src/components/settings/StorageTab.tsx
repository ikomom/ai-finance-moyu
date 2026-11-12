//! Storage & Cache Management Tab in Settings.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines) and §15 (theme-adaptive).

import { createSignal, onMount, Show } from 'solid-js'
import {
  clearCacheCategory,
  fetchStorageStats,
  migrateStorageDir,
  openDataFolder,
  selectFolder,
} from '../../tauri'
import type { StorageStats } from '../../types'
import { useSettings } from './SettingsContext'
import './StorageTab.css'

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function StorageTab() {
  const { say } = useSettings()
  const [stats, setStats] = createSignal<StorageStats | null>(null)
  const [targetPath, setTargetPath] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [migrating, setMigrating] = createSignal(false)

  const loadStats = async () => {
    setLoading(true)
    try {
      const s = await fetchStorageStats()
      if (s) {
        setStats(s)
        if (!targetPath()) {
          setTargetPath(s.dataDir)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  onMount(() => {
    void loadStats()
  })

  const cleanableBytes = () => {
    const s = stats()
    if (!s) return 0
    return s.historyTrendSizeBytes + s.baselineCacheSizeBytes + s.logsSizeBytes + s.klineCacheSizeBytes
  }

  const handlePickFolder = async () => {
    const picked = await selectFolder()
    if (picked) {
      setTargetPath(picked)
    }
  }

  const handleMigrate = async () => {
    const target = targetPath().trim()
    const current = stats()?.dataDir
    if (!target) {
      say('目标目录路径不能为空', 'bad')
      return
    }
    if (target === current) {
      say('目标路径与当前路径相同，无需迁移', 'bad')
      return
    }

    if (!window.confirm(`确定要将所有数据（配置、账本、分时归档、日志及AI模型，共 ${fmtBytes(stats()?.totalSizeBytes ?? 0)}）迁移至新目录吗？\n\n新路径：${target}`)) {
      return
    }

    setMigrating(true)
    say('正在迁移数据文件，请稍候…', '')
    try {
      const res = await migrateStorageDir(target)
      if (res.success) {
        say(`数据目录迁移成功！已移动 ${res.fileCount} 个文件 (${fmtBytes(res.totalBytes)})`, 'ok')
        await loadStats()
      }
    } catch (e) {
      say(`数据迁移失败: ${e}`, 'bad')
    } finally {
      setMigrating(false)
    }
  }

  const handleClear = async (category: string, label: string) => {
    if (!window.confirm(`确定要清除【${label}】吗？此操作不可逆。`)) {
      return
    }
    const ok = await clearCacheCategory(category)
    if (ok) {
      say(`已清理【${label}】`, 'ok')
      await loadStats()
    } else {
      say(`清理【${label}】失败`, 'bad')
    }
  }

  return (
    <div class="storage-pane">
      {/* 1. Global Data Directory Card */}
      <div class="storage-card">
        <div class="storage-card-header">
          <div class="storage-card-title">
            <span>📁 数据存储根目录</span>
            <Show when={stats()}>
              <span class={`storage-badge ${stats()!.isCustomDir ? 'custom' : 'default'}`}>
                {stats()!.isCustomDir ? '自定义目录' : '默认系统目录'}
              </span>
            </Show>
          </div>
          <button type="button" class="btn-ghost" onClick={() => void openDataFolder()} title="在资源管理器中打开">
            📂 打开文件夹
          </button>
        </div>

        <div class="storage-path-box">
          <span class="storage-path-text">{stats()?.dataDir || '正在检测…'}</span>
        </div>

        <div class="storage-input-row">
          <input
            type="text"
            placeholder="输入或粘贴目标存储绝对路径 (如 D:\FinanceData)"
            value={targetPath()}
            onInput={(e) => setTargetPath(e.currentTarget.value)}
          />
          <button type="button" class="btn-ghost" onClick={handlePickFolder}>
            浏览…
          </button>
          <button
            type="button"
            class="btn-primary"
            disabled={migrating() || loading()}
            onClick={handleMigrate}
          >
            {migrating() ? '迁移中…' : '迁移至新目录'}
          </button>
        </div>

        <div class="storage-hint-box">
          <span>💡 提示：迁移会将当前配置、模拟账本、分时归档及日志整体安全搬迁，并在系统保留自动重定向指针。</span>
        </div>
      </div>

      {/* 2. Detailed Cache Breakdown Card */}
      <div class="storage-card">
        <div class="storage-card-header">
          <div class="storage-card-title">
            <span>💾 缓存分类与精细化管理</span>
          </div>
          <button type="button" class="btn-ghost" onClick={() => void loadStats()} disabled={loading()}>
            🔄 刷新占用
          </button>
        </div>

        <div class="storage-cache-list">
          <div class="storage-cache-item">
            <div class="storage-cache-info">
              <span class="storage-cache-name">📈 历史分时全景归档</span>
              <span class="storage-cache-desc">
                已沉淀 {stats()?.historyTrendDayCount ?? 0} 个单日 240 点全景分时，用于日K下钻与分时复盘
              </span>
            </div>
            <div class="storage-cache-actions">
              <span class="storage-cache-size">{fmtBytes(stats()?.historyTrendSizeBytes ?? 0)}</span>
              <button
                type="button"
                class="btn-ghost"
                onClick={() => void handleClear('history_trend', '历史分时归档')}
              >
                清理
              </button>
            </div>
          </div>

          <div class="storage-cache-item">
            <div class="storage-cache-info">
              <span class="storage-cache-name">🛡️ 离线行情保底缓存</span>
              <span class="storage-cache-desc">记录上次收盘最新报价与当日分时，开机/弱网时秒开防白屏</span>
            </div>
            <div class="storage-cache-actions">
              <span class="storage-cache-size">{fmtBytes(stats()?.baselineCacheSizeBytes ?? 0)}</span>
              <button
                type="button"
                class="btn-ghost"
                onClick={() => void handleClear('baseline', '离线行情保底缓存')}
              >
                重置
              </button>
            </div>
          </div>

          <div class="storage-cache-item">
            <div class="storage-cache-info">
              <span class="storage-cache-name">📋 运行与审计日志</span>
              <span class="storage-cache-desc">异动预警、交易账本审计及运行故障排查日志 (保留当前活跃会话)</span>
            </div>
            <div class="storage-cache-actions">
              <span class="storage-cache-size">{fmtBytes(stats()?.logsSizeBytes ?? 0)}</span>
              <button
                type="button"
                class="btn-ghost"
                onClick={() => void handleClear('logs', '归档日志文件')}
              >
                清理
              </button>
            </div>
          </div>
          <Show when={(stats()?.aiModelsSizeBytes ?? 0) > 0}>
            <div class="storage-cache-item">
              <div class="storage-cache-info">
                <span class="storage-cache-name">🤖 本地 AI 决策大模型</span>
                <span class="storage-cache-desc">已下载的本地离线决策大模型权重文件 (Laya / Jev)</span>
              </div>
              <div class="storage-cache-actions">
                <span class="storage-cache-size">{fmtBytes(stats()?.aiModelsSizeBytes ?? 0)}</span>
                <button
                  type="button"
                  class="btn-ghost"
                  onClick={() => void handleClear('ai_models', '本地 AI 决策模型')}
                >
                  清理
                </button>
              </div>
            </div>
          </Show>
        </div>

        <div class="storage-summary-bar">
          <div class="storage-summary-text">
            <span>可清理缓存:</span>
            <span class="storage-summary-total">{fmtBytes(cleanableBytes())}</span>
            <span style={{ 'margin-left': '8px', opacity: '0.65' }}>
              (全盘总数据: {fmtBytes(stats()?.totalSizeBytes ?? 0)})
            </span>
          </div>
          <button
            type="button"
            class="btn-danger"
            onClick={() => void handleClear('all_cache', '全部可再生缓存')}
          >
            🧹 一键清理所有缓存
          </button>
        </div>

        <div class="storage-hint-box">
          <span>🔒 核心资产保护：用户的自选股池、预警配置与模拟账本受快照保护，绝不会被任何“清理缓存”删除。</span>
        </div>
      </div>
    </div>
  )
}
