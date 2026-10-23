//! System Settings Tab (Hotkeys, Autostart, App Updates).
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

import { HotkeySettingsCard } from './HotkeySettingsCard'
import { EnvironmentCard } from './EnvironmentCard'
import { AppUpdateCard } from './AppUpdateCard'
import './SystemTab.css'

export function SystemTab() {
  return (
    <div class="tab-pane">
      <HotkeySettingsCard />
      <EnvironmentCard />
      <AppUpdateCard />
    </div>
  )
}
