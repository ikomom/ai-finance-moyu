import { hasActiveBackInterceptor, tryConsumeBack } from '../services/backInterceptor'
import { inTauri } from '../tauri'

export interface NavigationHandlers {
  isCollapsed?: () => boolean
  onBack: () => void
  onForward: () => void
}

const SIDE_BUTTON_DEBOUNCE_MS = 50

/**
 * Attaches capture-phase mouse side button (XBUTTON1/2), BrowserBack/Forward key,
 * and Win32 Tauri `mouse-side-nav` listeners plus zoom prevention.
 */
export function setupWidgetNavigation(handlers: NavigationHandlers): () => void {
  let lastTriggerAt = 0
  let lastTriggerDir: 'back' | 'forward' | null = null
  let disposed = false
  let unlistenSideNav: (() => void) | undefined

  const trigger = (dir: 'back' | 'forward') => {
    if (handlers.isCollapsed?.()) return

    const now = Date.now()
    if (lastTriggerDir === dir && now - lastTriggerAt < SIDE_BUTTON_DEBOUNCE_MS) {
      return
    }
    lastTriggerAt = now
    lastTriggerDir = dir

    if (dir === 'back') {
      if (tryConsumeBack()) return
      handlers.onBack()
    } else {
      if (hasActiveBackInterceptor()) return
      handlers.onForward()
    }
  }

  if (inTauri()) {
    void import('@tauri-apps/api/webviewWindow')
      .then(({ getCurrentWebviewWindow }) =>
        getCurrentWebviewWindow().listen<{ dir?: 'back' | 'forward' }>('mouse-side-nav', (e) => {
          if (e.payload?.dir === 'back') trigger('back')
          else if (e.payload?.dir === 'forward') trigger('forward')
        })
      )
      .then((unlisten) => {
        if (disposed) unlisten()
        else unlistenSideNav = unlisten
      })
      .catch(() => {})
  }

  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'BrowserBack') {
      e.preventDefault()
      e.stopPropagation()
      trigger('back')
      return
    }
    if (e.key === 'BrowserForward') {
      e.preventDefault()
      e.stopPropagation()
      trigger('forward')
      return
    }
    if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
      e.preventDefault()
    }
  }

  const stopSideButtonPointer = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.stopPropagation()
    }
  }

  const preventDefaultSideButtons = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === 3) {
      e.preventDefault()
      e.stopPropagation()
      trigger('back')
    } else if (e.button === 4) {
      e.preventDefault()
      e.stopPropagation()
      trigger('forward')
    }
  }

  window.addEventListener('wheel', handleWheel, { passive: false })
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('pointerdown', stopSideButtonPointer, true)
  window.addEventListener('mousedown', preventDefaultSideButtons, true)
  window.addEventListener('pointerup', stopSideButtonPointer, true)
  window.addEventListener('mouseup', handleMouseUp, true)
  window.addEventListener('auxclick', preventDefaultSideButtons, true)

  return () => {
    disposed = true
    unlistenSideNav?.()
    window.removeEventListener('wheel', handleWheel)
    window.removeEventListener('keydown', handleKeyDown, true)
    window.removeEventListener('pointerdown', stopSideButtonPointer, true)
    window.removeEventListener('mousedown', preventDefaultSideButtons, true)
    window.removeEventListener('pointerup', stopSideButtonPointer, true)
    window.removeEventListener('mouseup', handleMouseUp, true)
    window.removeEventListener('auxclick', preventDefaultSideButtons, true)
  }
}
