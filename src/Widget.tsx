import { createEffect, createSignal, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'

import { ContextMenu, closeMenu, isContextMenuOpen, setContextMenuOpen } from './components/ContextMenu'
import { Toast } from './components/Toast'
import { openCopilotWindow } from './services/agent'
import { Bar } from './layouts/Bar'
import { Global } from './layouts/Global'
import { List } from './layouts/List'
import { Market } from './layouts/Market'
import { Mini } from './layouts/Mini'
import { checkAppUpdate } from './services/updater'
import {
  alertTick,
  initStore,
  navigateLayoutBack,
  navigateLayoutForward,
  selectedIndex,
  setNewVersionAvailable,
  showToast,
  snapshot,
} from './store'
import { report } from './utils/devReport'
import { setupWidgetNavigation } from './utils/widgetInteraction'

/** The display widget: layout routing, right-click menu and alert flash. */
export function Widget() {
  const [error, setError] = createSignal<string | null>(null)
  const [flash, setFlash] = createSignal(false)
  let leaveTimer: number | null = null

  const clearLeaveTimer = () => {
    if (leaveTimer !== null) {
      window.clearTimeout(leaveTimer)
      leaveTimer = null
    }
  }

  const dockEdge = () => snapshot()?.dock?.edge ?? 'none'
  const isCollapsed = () => snapshot()?.dock?.collapsed ?? false
  const visibilityMode = () => snapshot()?.config.visibilityMode ?? 'always'

  createEffect(() => {
    const theme = snapshot()?.config.theme ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  })

  const handleMouseEnter = () => {
    clearLeaveTimer()
    const mode = visibilityMode()
    const edge = dockEdge()
    if (edge === 'none') return

    if ((mode === 'hover' || mode === 'always') && isCollapsed()) {
      void invoke('set_dock_collapsed', { collapsed: false })
    }
  }

  const handleMouseLeave = (e: MouseEvent) => {
    clearLeaveTimer()
    // Do not collapse if mouse button is held down (dragging or resizing)
    if (e.buttons > 0) return
    if (isContextMenuOpen()) return

    const mode = visibilityMode()
    const edge = dockEdge()
    if (edge === 'none') return

    if (mode === 'hover' && !isCollapsed()) {
      leaveTimer = window.setTimeout(() => {
        void invoke('set_dock_collapsed', { collapsed: true })
      }, 350)
    } else if (mode === 'dblclick' && !isCollapsed()) {
      leaveTimer = window.setTimeout(() => {
        void invoke('set_dock_collapsed', { collapsed: true })
      }, 2000)
    }
  }

  const handleDblClick = (e: MouseEvent) => {
    const mode = visibilityMode()
    const edge = dockEdge()
    if (edge === 'none') return

    if (mode === 'dblclick') {
      if (isCollapsed()) {
        e.preventDefault()
        e.stopPropagation()
        clearLeaveTimer()
        void invoke('set_dock_collapsed', { collapsed: false })
      } else {
        const target = e.target as HTMLElement
        // Ignore double click inside table rows, pills, inputs, canvas, etc.
        if (target.closest?.('.table-row, .stock-pill, .watch, input, button, select, canvas, a')) return
        e.preventDefault()
        e.stopPropagation()
        clearLeaveTimer()
        void invoke('set_dock_collapsed', { collapsed: true })
      }
    }
  }

  onMount(async () => {
    const err = await initStore()
    if (err) setError(err)

    let lastMenuClosedAt = 0

    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault()
      // Reject if context menu is already active or in dismiss cooldown window
      if (isContextMenuOpen() || Date.now() - lastMenuClosedAt < 250) {
        return
      }
      if (isCollapsed()) {
        void invoke('set_dock_collapsed', { collapsed: false })
        return
      }
      clearLeaveTimer()
      setContextMenuOpen(true)
      try {
        await invoke('show_context_menu')
      } finally {
        setContextMenuOpen(false)
        lastMenuClosedAt = Date.now()
      }
    }

    const handleMouseDownOutside = (e: MouseEvent) => {
      // Dismiss on any press outside the menu, right-click included.
      if (!(e.target as HTMLElement).closest?.('.menu')) closeMenu()
    }

    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('mousedown', handleMouseDownOutside)

    const cleanupNav = setupWidgetNavigation({
      isCollapsed,
      onExpand: () => void invoke('set_dock_collapsed', { collapsed: false }),
      onBack: navigateLayoutBack,
      onForward: navigateLayoutForward,
    })

    // `report()` walks every canvas and hits the backend bridge; a resize drag
    // fires dozens of these per second, which AGENTS.md §7 explicitly forbids.
    let reportTimer: number | null = null
    window.addEventListener('resize', () => {
      clearLeaveTimer()
      if (reportTimer !== null) window.clearTimeout(reportTimer)
      reportTimer = window.setTimeout(() => {
        reportTimer = null
        report()
      }, 300)
    })

    // Background auto-check for updates (delayed 8s after boot, and every 4 hours thereafter)
    const checkUpdateSilently = async () => {
      try {
        const res = await checkAppUpdate(false)
        if (res.hasUpdate && res.newVersion) {
          setNewVersionAvailable(res.newVersion)
          showToast(`🚀 发现新版本 v${res.newVersion}`, undefined, undefined, async () => {
            await invoke('open_settings_window')
            await emit('trigger-check-update')
          })
        }
      } catch {
        // Silent background check: ignore network errors
      }
    }

    const initialUpdateTimer = window.setTimeout(checkUpdateSilently, 8000)
    const periodicUpdateTimer = window.setInterval(checkUpdateSilently, 4 * 60 * 60 * 1000)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        void openCopilotWindow(snapshot()?.quotes[selectedIndex()]?.code)
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    onCleanup(() => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('mousedown', handleMouseDownOutside)
      cleanupNav()
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(initialUpdateTimer)
      window.clearInterval(periodicUpdateTimer)
    })
  })

  onCleanup(() => {
    clearLeaveTimer()
  })

  // Flash the border when a threshold is crossed. The CSS animation runs
  // 3 x 0.9s, so the flag is cleared to match.
  createEffect(() => {
    if (alertTick() === 0) return
    setFlash(true)
    const timer = window.setTimeout(() => setFlash(false), 2700)
    onCleanup(() => window.clearTimeout(timer))
  })

  return (
    <div
      class="widget"
      classList={{
        'is-collapsed': isCollapsed(),
        [`docked-${dockEdge()}`]: dockEdge() !== 'none',
      }}
      data-tauri-drag-region
      style={{ opacity: snapshot()?.config.opacity ?? 1 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDblClick={handleDblClick}
    >
      <Show when={isCollapsed() && dockEdge() !== 'none'}>
        <div
          class={`dock-handle dock-${dockEdge()}`}
          title={visibilityMode() === 'dblclick' ? '双击展开' : '移入展开'}
          onClick={(e) => {
            e.stopPropagation()
            clearLeaveTimer()
            void invoke('set_dock_collapsed', { collapsed: false })
          }}
          onDblClick={(e) => {
            e.stopPropagation()
            clearLeaveTimer()
            void invoke('set_dock_collapsed', { collapsed: false })
          }}
        />
      </Show>

      <Show when={!isCollapsed()}>
        <Show
          when={error()}
          fallback={
            <Show
              when={snapshot()}
              fallback={
                <div class="card">
                  <div class="card-head">加载中…</div>
                </div>
              }
            >
              {(s) => (
                <Switch>
                  <Match when={s().config.layout === 'bar'}>
                    <Bar snapshot={s()} flash={flash()} />
                  </Match>
                  <Match when={s().config.layout === 'list'}>
                    <List flash={flash()} />
                  </Match>
                  <Match when={s().config.layout === 'market'}>
                    <Market flash={flash()} />
                  </Match>
                  <Match when={s().config.layout === 'global'}>
                    <Global flash={flash()} />
                  </Match>
                  <Match when={true}>
                    <Mini flash={flash()} />
                  </Match>
                </Switch>
              )}
            </Show>
          }
        >
          {(err) => (
            <div class="card">
              <div class="card-head">初始化失败</div>
              <div class="status">
                <span class="err">{err()}</span>
              </div>
            </div>
          )}
        </Show>

        <ContextMenu />
        <Toast />
      </Show>
    </div>
  )
}

