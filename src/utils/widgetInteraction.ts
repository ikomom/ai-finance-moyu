export interface NavigationHandlers {
  isCollapsed: () => boolean
  onExpand: () => void
  onBack: () => void
  onForward: () => void
}

/**
 * Attaches zoom prevention and mouse side button navigation listeners.
 * Returns an unlisten cleanup callback.
 */
export function setupWidgetNavigation(handlers: NavigationHandlers): () => void {
  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault()
  }

  const handleKeyZoom = (e: KeyboardEvent) => {
    if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
      e.preventDefault()
    }
  }

  const handleMouseSideButtons = (e: MouseEvent) => {
    if (e.button === 3) {
      e.preventDefault()
      e.stopPropagation()
      if (handlers.isCollapsed()) handlers.onExpand()
      handlers.onBack()
    } else if (e.button === 4) {
      e.preventDefault()
      e.stopPropagation()
      if (handlers.isCollapsed()) handlers.onExpand()
      handlers.onForward()
    }
  }

  const preventDefaultSideButtons = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  document.addEventListener('wheel', handleWheel, { passive: false })
  document.addEventListener('keydown', handleKeyZoom)
  document.addEventListener('mousedown', preventDefaultSideButtons)
  document.addEventListener('mouseup', handleMouseSideButtons)
  document.addEventListener('auxclick', preventDefaultSideButtons)

  return () => {
    document.removeEventListener('wheel', handleWheel)
    document.removeEventListener('keydown', handleKeyZoom)
    document.removeEventListener('mousedown', preventDefaultSideButtons)
    document.removeEventListener('mouseup', handleMouseSideButtons)
    document.removeEventListener('auxclick', preventDefaultSideButtons)
  }
}
