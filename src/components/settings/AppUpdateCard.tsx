//! App version and auto-updater card.
//!
//! Complies with AGENTS.md §11 (isolated component, <=300 lines).

import { Show } from 'solid-js'
import { useSettings } from './SettingsContext'

export function AppUpdateCard() {
  const {
    currentAppVersion,
    updateResult,
    updateCheckMsg,
    isCheckingUpdate,
    setIsUpdateModalOpen,
    handleOpenReleasePage,
    handleManualCheckUpdate,
  } = useSettings()

  return (
    <div class="card">
      <div class="card-title-row">
        <h2>
          <span class="title-icon">🚀</span>
          <span>版本与自动更新</span>
        </h2>
        <span class="card-badge">正式发布通道</span>
      </div>
      <p class="hint">
        通过 GitHub Releases 官方通道获取最新构建与更新日志，支持应用内自动下载校验、一键安装与重启。
      </p>
      <div class="field" style={{ "margin-top": "12px" }}>
        <div class="inline" style={{ "justify-content": "space-between", "align-items": "center" }}>
          <div>
            <strong>当前运行版本：</strong>
            <span class="mono" style={{ "color": "#70aaff", "font-weight": "600" }}>v{currentAppVersion()}</span>
            <Show when={updateCheckMsg()}>
              <span class="muted" style={{ "margin-left": "14px", "font-size": "12px" }}>
                {updateCheckMsg()}
              </span>
            </Show>
          </div>
          <div class="inline" style={{ "gap": "8px" }}>
            <button
              type="button"
              class="ghost"
              onClick={() => void handleOpenReleasePage()}
            >
              🌐 发布页面
            </button>
            <button
              type="button"
              class="btn-primary"
              style={{ "padding": "5px 12px", "font-size": "12px" }}
              disabled={isCheckingUpdate()}
              onClick={() => {
                if (updateResult()?.hasUpdate) {
                  setIsUpdateModalOpen(true)
                } else {
                  void handleManualCheckUpdate()
                }
              }}
            >
              {isCheckingUpdate()
                ? '🔄 检查中…'
                : updateResult()?.hasUpdate
                  ? '🚀 查看新版'
                  : '🔄 检查更新'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
