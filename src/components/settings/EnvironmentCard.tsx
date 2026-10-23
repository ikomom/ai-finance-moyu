//! Environment behavior card (e.g. system autostart).
//!
//! Complies with AGENTS.md §11 (isolated component, <=300 lines).

import { useSettings } from './SettingsContext'

export function EnvironmentCard() {
  const { form, setForm } = useSettings()

  return (
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
  )
}
