import { For } from 'solid-js'
import { LAYOUTS, VISIBILITIES, useSettings } from './SettingsContext'
import './AppearanceTab.css'

export function AppearanceTab() {
  const { form, setForm, say, sizesText } = useSettings()

  return (
    <div class="tab-pane">
      {/* 1. 默认显示形态 */}
      <div class="card">
        <div class="card-title-row">
          <h2>默认显示形态</h2>
          <span class="card-badge">随时按快捷键切换</span>
        </div>
        <p class="hint">选择启动时默认呈现的形态，可在托盘菜单或按快捷键随时切换。</p>
        <div class="grid-options col-3">
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

      {/* 2. 窗口显隐与贴边收起策略 */}
      <div class="card">
        <div class="card-title-row">
          <h2>窗口显隐与贴边收起策略</h2>
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

      {/* 3. 窗口透明度与尺寸记忆 */}
      <div class="card">
        <div class="card-title-row">
          <h2>窗口透明度与尺寸记忆</h2>
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
