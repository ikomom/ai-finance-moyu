import { createEffect, createSignal, Match, onCleanup, onMount, Show, Switch } from 'solid-js'
import { invoke } from '@tauri-apps/api/core'

import { ContextMenu, closeMenu, isContextMenuOpen } from './components/ContextMenu'
import { Toast } from './components/Toast'
import { Bar } from './layouts/Bar'
import { List } from './layouts/List'
import { Mini } from './layouts/Mini'
import { alertTick, initStore, snapshot } from './store'
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

  const handleMouseLeave = () => {
    clearLeaveTimer()
    if (isContextMenuOpen()) return
    const mode = visibilityMode()
    const edge = dockEdge()
    if (edge === 'none') return

    if (mode === 'hover' && !isCollapsed()) {
      leaveTimer = window.setTimeout(() => {
        void invoke('set_dock_collapsed', { collapsed: true })
      }, 300)
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

    document.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (isCollapsed()) {
        void invoke('set_dock_collapsed', { collapsed: false })
        return
      }
      void invoke('show_context_menu')
    })
    document.addEventListener('mousedown', (e) => {
      // Dismiss on any press outside the menu, right-click included.
      if (!(e.target as HTMLElement).closest?.('.menu')) closeMenu()
    })
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
    // The window is user-resizable; the chart handles its own redraw, this just
    // refreshes the diagnostics.
    window.addEventListener('resize', () => report())
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

  createEffect(() => report())

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
