import { For, Show } from 'solid-js'
import { getCurrentWindow } from '@tauri-apps/api/window'

import { UpdateModal } from './components/UpdateModal'
import { setSkippedVersion } from './services/updater'
import { SettingsProvider, useSettings, TABS } from './components/settings/SettingsContext'
import { WatchlistTab } from './components/settings/WatchlistTab'
import { AppearanceTab } from './components/settings/AppearanceTab'
import { AlertsTab } from './components/settings/AlertsTab'
import { SystemTab } from './components/settings/SystemTab'
import { LogsTab } from './components/settings/LogsTab'

function SettingsContent() {
  const {
    ready,
    activeTab,
    setActiveTab,
    msg,
    currentAppVersion,
    updateResult,
    setUpdateResult,
    isCheckingUpdate,
    handleManualCheckUpdate,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    say,
    save,
  } = useSettings()

  return (
    <div id="settings-root">
      <Show when={ready()} fallback={<div class="loading-state">{msg().text || '正在载入参数配置…'}</div>}>
        <div id="settings-layout">
          {/* Left Sidebar */}
          <aside id="sidebar">
            <div class="sidebar-header">
              <span class="brand-badge">⚡</span>
              <div class="brand-text">
                <span class="brand-title">A股摸鱼</span>
                <span class="brand-sub">配置中心</span>
              </div>
            </div>

            <nav class="sidebar-nav">
              <For each={TABS}>
                {(tab) => (
                  <button
                    type="button"
                    class="nav-tab-btn"
                    classList={{ active: activeTab() === tab.id }}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span class="tab-icon">{tab.icon}</span>
                    <div class="tab-text">
                      <span class="tab-label">{tab.label}</span>
                      <span class="tab-desc">{tab.desc}</span>
                    </div>
                  </button>
                )}
              </For>
            </nav>

            {/* Sidebar Footer with Version & Check Update */}
            <div class="sidebar-footer">
              <div class="version-status-row">
                <span class="version-label">
                  v{currentAppVersion()}
                  <Show when={updateResult()?.hasUpdate}>
                    <span class="update-available-dot" title="有新版本可用" />
                  </Show>
                </span>
                <button
                  type="button"
                  class="btn-check-update-sidebar"
                  disabled={isCheckingUpdate()}
                  onClick={() => {
                    if (updateResult()?.hasUpdate) {
                      setIsUpdateModalOpen(true)
                    } else {
                      void handleManualCheckUpdate()
                    }
                  }}
                >
                  {isCheckingUpdate() ? '检查中…' : updateResult()?.hasUpdate ? '发现新版' : '检查更新'}
                </button>
              </div>
            </div>
          </aside>

          {/* Right Main Content Panel */}
          <section id="main-panel">
            <div class="content-body">
              <Show when={activeTab() === 'watchlist'}>
                <WatchlistTab />
              </Show>
              <Show when={activeTab() === 'appearance'}>
                <AppearanceTab />
              </Show>
              <Show when={activeTab() === 'alerts'}>
                <AlertsTab />
              </Show>
              <Show when={activeTab() === 'system'}>
                <SystemTab />
              </Show>
              <Show when={activeTab() === 'logs'}>
                <LogsTab />
              </Show>
            </div>

            {/* Bottom Actions Bar */}
            <footer id="footer-bar">
              <div id="status-msg" class={msg().kind}>
                {msg().text}
              </div>
              <div class="footer-btns">
                <button type="button" class="btn-ghost" onClick={() => void getCurrentWindow().close()}>
                  关闭
                </button>
                <button type="button" class="btn-primary" disabled={!ready()} onClick={() => void save()}>
                  保存并刷新生效
                </button>
              </div>
            </footer>
          </section>
        </div>
      </Show>

      <UpdateModal
        isOpen={isUpdateModalOpen()}
        result={updateResult()}
        currentVersion={currentAppVersion()}
        onClose={() => setIsUpdateModalOpen(false)}
        onSkipVersion={(v) => {
          setSkippedVersion(v)
          setUpdateResult((prev) => (prev ? { ...prev, hasUpdate: false } : null))
          say(`已跳过版本 v${v}，可在设置面板中重新检查`, 'ok')
        }}
      />
    </div>
  )
}

export function Settings() {
  return (
    <SettingsProvider>
      <SettingsContent />
    </SettingsProvider>
  )
}
