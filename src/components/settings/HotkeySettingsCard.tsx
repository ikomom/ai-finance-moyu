//! Hotkey settings card for configuring global shortcuts.
//!
//! Complies with AGENTS.md §11 (isolated component, <=300 lines).

import { For } from 'solid-js'
import { HOTKEY_FIELDS, useSettings } from './SettingsContext'

export function HotkeySettingsCard() {
  const { form, setForm } = useSettings()

  return (
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
  )
}
