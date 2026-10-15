import { createEffect, createSignal, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'

import { ContextMenu, closeMenu, isContextMenuOpen, setContextMenuOpen } from './components/ContextMenu'
import { Toast } from './components/Toast'
import { Bar } from './layouts/Bar'
import { List } from './layouts/List'
import { Market } from './layouts/Market'
import { Mini } from './layouts/Mini'
import { alertTick, initStore, navigateLayoutBack, navigateLayoutForward, snapshot } from './store'
import { logToBackend } from './tauri'

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
    // Disable Ctrl + wheel zoom and keyboard zoom
    document.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) e.preventDefault()
      },
      { passive: false }
    )
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault()
      }
    })
    // Mouse side buttons (shoulder keys: X1=Back / X2=Forward) navigation
    const handleMouseSideButtons = (e: MouseEvent) => {
      if (e.button === 3) {
        // Button 3: Browser Back / X1 shoulder button -> Navigate back in layout history
        e.preventDefault()
        e.stopPropagation()
        if (isCollapsed()) {
          void invoke('set_dock_collapsed', { collapsed: false })
        }
        navigateLayoutBack()
      } else if (e.button === 4) {
        // Button 4: Browser Forward / X2 shoulder button -> Navigate forward in layout history
        e.preventDefault()
        e.stopPropagation()
        if (isCollapsed()) {
          void invoke('set_dock_collapsed', { collapsed: false })
        }
        navigateLayoutForward()
      }
    }

    const preventDefaultSideButtons = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    document.addEventListener('mousedown', preventDefaultSideButtons)
    document.addEventListener('mouseup', handleMouseSideButtons)
    document.addEventListener('auxclick', preventDefaultSideButtons)

    window.addEventListener('resize', () => {
      clearLeaveTimer()
      report()
    })

    onCleanup(() => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('mousedown', handleMouseDownOutside)
      document.removeEventListener('mousedown', preventDefaultSideButtons)
      document.removeEventListener('mouseup', handleMouseSideButtons)
      document.removeEventListener('auxclick', preventDefaultSideButtons)
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

/**
 * Report what actually rendered.
 *
 * A transparent widget that fails silently shows nothing at all, and the webview
 * console is not reachable from the terminal, so this mirrors the geometry into
 * both the process log and the DOM. Dev only: `getBoundingClientRect` forces a
 * layout, which is not worth doing on every poll in a shipped build.
 */
function report(): void {
  if (!import.meta.env.DEV) return

  const s = snapshot()
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    const r = c.getBoundingClientRect()
    return (
      `${c.className} box=${Math.round(r.width)}x${Math.round(r.height)}` +
      ` attr=${c.width}x${c.height} dpr=${window.devicePixelRatio}` +
      ` pts=${c.dataset.points ?? 'n/a'} geom=${c.dataset.geom ?? 'n/a'}`
    )
  })

  const msg =
    `layout=${s?.config.layout} quotes=${s?.quotes.length ?? 0} ` +
    `trends=${s ? Object.keys(s.trends).length : 0} source=${s?.config.dataSource} ` +
    `viewport=${window.innerWidth}x${window.innerHeight} [${canvases.join(' | ')}]`

  document.body.dataset.diag = msg
  logToBackend(msg)
}
