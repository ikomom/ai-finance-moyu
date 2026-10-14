import { createSignal, For, Show } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'

import { snapshot } from '../store'
import type { Layout, VisibilityMode } from '../types'

const LAYOUTS: Array<[Layout, string]> = [
  ['bar', '数字条'],
  ['mini', '迷你图'],
  ['list', '列表'],
]

const VISIBILITY_MODES: Array<[VisibilityMode, string]> = [
  ['always', '常驻显示'],
  ['hover', '鼠标悬停展开'],
  ['dblclick', '双击把手展开'],
  ['hotkey', '仅快捷键控制'],
]

// Module-level: there is exactly one context menu, and the right-click handler
// lives outside the component tree.
const [at, setAt] = createSignal<{ x: number; y: number } | null>(null)
const [isNativeMenuOpen, setIsNativeMenuOpen] = createSignal(false)

export function openMenuAt(x: number, y: number): void {
  setAt({ x, y })
}

export function closeMenu(): void {
  setAt(null)
  setIsNativeMenuOpen(false)
}

export function setContextMenuOpen(open: boolean): void {
  setIsNativeMenuOpen(open)
}

export function isContextMenuOpen(): boolean {
  return isNativeMenuOpen() || at() !== null
}

export function ContextMenu() {
  let el!: HTMLDivElement

  /** Keep the menu inside the window; the widget is small and sits near edges. */
  const position = () => {
    const p = at()
    if (!p || !el) return { left: '0px', top: '0px' }
    const r = el.getBoundingClientRect()
    return {
      left: `${Math.min(p.x, window.innerWidth - r.width - 2)}px`,
      top: `${Math.min(p.y, window.innerHeight - r.height - 2)}px`,
    }
  }

  const act = async (fn: () => Promise<unknown>) => {
    closeMenu()
    try {
      await fn()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <Show when={at()}>
      <div ref={el} class="menu" style={position()}>
        <For each={LAYOUTS}>
          {([value, label]) => (
            <div
              class="menu-item"
              onClick={() => act(() => invoke('set_layout', { layout: value }))}
            >
              <span class="check">{snapshot()?.config.layout === value ? '●' : ''}</span>
              {label}
            </div>
          )}
        </For>

        <div class="menu-sep" />

        <For each={VISIBILITY_MODES}>
          {([value, label]) => (
            <div
              class="menu-item"
              onClick={() => act(() => invoke('set_visibility_mode', { mode: value }))}
            >
              <span class="check">{snapshot()?.config.visibilityMode === value ? '●' : ''}</span>
              {label}
            </div>
          )}
        </For>

        <div class="menu-sep" />

        <div class="menu-range">
          透明度
          <input
            type="range"
            min="30"
            max="100"
            value={Math.round((snapshot()?.config.opacity ?? 1) * 100)}
            onChange={(e) => {
              const s = snapshot()
              if (!s) return
              const opacity = Number(e.currentTarget.value) / 100
              void invoke('save_config', { cfg: { ...s.config, opacity } })
            }}
          />
        </div>

        <div class="menu-sep" />

        <div class="menu-item" onClick={() => act(() => invoke('refresh_now'))}>
          <span class="check" />
          立即刷新
        </div>
        <div class="menu-item" onClick={() => act(() => invoke('open_settings_window'))}>
          <span class="check" />
          设置…
        </div>

        <div class="menu-sep" />

        <div class="menu-item" onClick={() => act(() => invoke('quit_app'))}>
          <span class="check" />
          退出
        </div>
      </div>
    </Show>
  )
}
