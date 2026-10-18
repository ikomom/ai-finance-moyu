import { For, Show } from 'solid-js'
import { HOTKEY_FIELDS, useSettings } from './SettingsContext'
import './SystemTab.css'

export function SystemTab() {
  const {
    form,
    setForm,
    currentAppVersion,
    updateResult,
    updateCheckMsg,
    isCheckingUpdate,
    setIsUpdateModalOpen,
    handleOpenReleasePage,
    handleManualCheckUpdate,
  } = useSettings()

  return (
    <div class="tab-pane">
      {/* 1. 全局热键设置 */}
      <div class="card">
        <div class="card-title-row">
          <h2>
            <span class="title-icon">⌨️</span>
            <span>全局热键设置</span>
          </h2>
        </div>
        <p class="hint">
          推荐使用 <code>Ctrl+Alt</code> 组合键（避免与 Windows 中文输入法 <code>Ctrl+Shift</code> 冲突）。
        </p>
        <For each={HOTKEY_FIELDS}>
          {([key, label, desc]) => (
            <div class="field hotkey-field">
              <div class="hotkey-label-group">
                <label for={`key-${key}`}>{label}</label>
                <span class="hotkey-sub-desc">{desc}</span>
              </div>
              <input
                id={`key-${key}`}
                type="text"
                spellcheck={false}
                value={form.hotkeys[key]}
                onInput={(e) => setForm('hotkeys', key, e.currentTarget.value)}
              />
            </div>
          )}
        </For>
      </div>

      {/* 2. 系统环境行为 */}
      <div class="card">
        <div class="card-title-row">
          <h2>
            <span class="title-icon">⚙️</span>
            <span>系统环境行为</span>
          </h2>
        </div>
        <div style="margin-top: 10px;">
          <label class="switch-label">
            <input
              type="checkbox"
              class="switch-input"
              checked={form.autostart}
              onChange={(e) => setForm('autostart', e.currentTarget.checked)}
            />
            <span class="switch-slider" />
            <span>开机自动在后台启动挂件</span>
          </label>
        </div>
      </div>

      {/* 3. 版本与自动更新 */}
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
    </div>
  )
}
