import { render } from 'solid-js/web'

import { Settings } from './SettingsApp'
import './settings.css'

const root = document.getElementById('root')
if (root) {
  // `settings.html` ships a static "正在载入配置中心…" splash so the window is
  // never blank while the module graph loads. `render()` *appends* to its
  // container instead of replacing its children, so without this the splash
  // stays as a full-height sibling and pushes the whole settings UI into the
  // second, unreachable screen (body has `overflow: hidden`).
  root.replaceChildren()
  render(() => <Settings />, root)
}
