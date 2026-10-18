import { For } from 'solid-js'
import { LAYOUTS, THEMES, VISIBILITIES, useSettings } from './SettingsContext'
import './AppearanceTab.css'

export function AppearanceTab() {
  const { form, setForm, say, sizesText } = useSettings()

  return (
    <div class="tab-pane">
      {/* 1. 视觉皮肤预设 */}
      <div class="card">
        <div class="card-title-row">
          <h2>
            <span class="title-icon">🎨</span>
            <span>全局视觉皮肤预设</span>
          </h2>
          <span class="card-badge highlight">实时无感生效</span>
        </div>
        <p class="hint">
          点击即刻实时预览。设置面板与前台悬浮窗全部自适应同步，适配不同办公、交易与摸鱼环境。
        </p>

        <div class="theme-grid">
          <For each={THEMES}>
            {(theme) => {
              const isActive = () => (form.theme ?? 'dark') === theme.value
              return (
                <div
                  class="theme-card"
                  classList={{ active: isActive() }}
                  onClick={() => {
                    setForm('theme', theme.value)
                    say(`已应用「${theme.name}」皮肤，点击下方保存即可持久化`, 'ok')
                  }}
                >
                  {/* Mini Preview Box */}
                  <div
                    class="theme-preview-box"
                    style={{
                      'background-color': theme.palette.bg,
                      'border-color': theme.palette.border,
                    }}
                  >
                    <div class="theme-preview-pill-row">
                      <span
                        class="theme-mini-chip"
                        style={{
                          background: `${theme.palette.up}22`,
                          color: theme.palette.up,
                          border: `1px solid ${theme.palette.up}55`,
                        }}
                      >
                        +2.45%
                      </span>
                      <span
                        class="theme-mini-chip"
                        style={{
                          background: `${theme.palette.down}22`,
                          color: theme.palette.down,
                          border: `1px solid ${theme.palette.down}55`,
                        }}
                      >
                        -1.20%
                      </span>
                    </div>

                    <div
                      class="theme-preview-body"
                      style={{
                        'background-color': theme.palette.card,
                        'border-color': theme.palette.border,
                      }}
                    >
                      <span
                        class="theme-preview-symbol"
                        style={{ color: theme.palette.text }}
                      >
                        {theme.icon} 示例走势
                      </span>
                      <div
                        class="theme-preview-line"
                        style={{ 'background-color': theme.palette.accent }}
                      />
                    </div>
                  </div>

                  {/* Theme Info */}
                  <div class="theme-head">
                    <div class="theme-title-group">
                      <span class="theme-name">{theme.name}</span>
                      <span class="theme-badge">{theme.badge}</span>
                    </div>
                    {isActive() && <span class="theme-active-tag">✓ 使用中</span>}
                  </div>
                  <span class="theme-desc">{theme.desc}</span>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* 2. 默认显示形态 */}
      <div class="card">
        <div class="card-title-row">
          <h2>
            <span class="title-icon">📐</span>
            <span>默认显示形态</span>
          </h2>
          <span class="card-badge">随时按快捷键切换</span>
        </div>
        <p class="hint">选择启动时默认呈现的形态，可在托盘菜单或按快捷键随时无缝切换。</p>
        <div class="grid-options layout-grid">
          <For each={LAYOUTS}>
            {(opt) => (
              <div
                class="opt-card"
                classList={{ active: form.layout === opt.value }}
                onClick={() => setForm('layout', opt.value)}
              >
                <div class="opt-head">
                  <span class="opt-icon">{opt.icon}</span>
                  <span class="opt-badge">{opt.badge}</span>
                </div>
                <span class="opt-name">{opt.name}</span>
                <span class="opt-desc">{opt.desc}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* 3. 窗口显隐与贴边收起策略 */}
      <div class="card">
        <div class="card-title-row">
          <h2>
            <span class="title-icon">🧲</span>
            <span>窗口显隐与贴边收起策略</span>
          </h2>
          <span class="card-badge">防窥避险</span>
        </div>
        <p class="hint">
          拖动窗口贴近屏幕<strong>左、右、顶</strong>边缘时触发。在屏幕中央位置时保持常显。
        </p>
        <div class="grid-options col-2">
          <For each={VISIBILITIES}>
            {(opt) => (
              <div
                class="opt-card"
                classList={{ active: (form.visibilityMode ?? 'always') === opt.value }}
                onClick={() => setForm('visibilityMode', opt.value)}
              >
                <div class="opt-head">
                  <span class="opt-icon">{opt.icon}</span>
                </div>
                <span class="opt-name">{opt.name}</span>
                <span class="opt-desc">{opt.desc}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* 4. 窗口透明度与尺寸记忆 */}
      <div class="card">
        <div class="card-title-row">
          <h2>
            <span class="title-icon">🎛️</span>
            <span>窗口透明度与尺寸记忆</span>
          </h2>
        </div>
        <div class="field">
          <label for="opacity">
            窗口透明度 <output>{Math.round(form.opacity * 100)}%</output>
          </label>
          <input
            id="opacity"
            type="range"
            min="30"
            max="100"
            step="1"
            value={Math.round(form.opacity * 100)}
            onInput={(e) => setForm('opacity', Number(e.currentTarget.value) / 100)}
          />
        </div>
        <div class="field" style={{ "margin-top": "12px" }}>
          <label>窗口尺寸记忆</label>
          <div class="inline">
            <span class="muted">{sizesText()}</span>
            <button
              type="button"
              class="ghost"
              onClick={() => {
                setForm('layoutSizes', {})
                say('已重置记住的窗口尺寸，保存后生效', 'ok')
              }}
            >
              恢复默认尺寸
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
