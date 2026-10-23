//! Unified hover debounce lifecycle and viewport clamping for badges.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

import { createSignal, onCleanup } from 'solid-js'
import { adjustPopoverPosition } from '../../utils/popoverPosition'

export interface BadgeHoverHook {
  hovered: () => boolean
  setWrapRef: (el: HTMLDivElement) => void
  setPopoverRef: (el: HTMLDivElement) => void
  handleMouseEnter: () => void
  handleMouseLeave: () => void
}

export function useBadgeHover(delayMs = 200): BadgeHoverHook {
  let wrapRef: HTMLDivElement | undefined
  let popoverRef: HTMLDivElement | undefined
  const [hovered, setHovered] = createSignal(false)
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const handleMouseEnter = () => {
    if (closeTimer) {
      clearTimeout(closeTimer)
      closeTimer = undefined
    }
    setHovered(true)
    adjustPopoverPosition(wrapRef, popoverRef)
  }

  const handleMouseLeave = () => {
    closeTimer = setTimeout(() => {
      setHovered(false)
    }, delayMs)
  }

  onCleanup(() => {
    if (closeTimer) clearTimeout(closeTimer)
  })

  return {
    hovered,
    setWrapRef: (el) => {
      wrapRef = el
    },
    setPopoverRef: (el) => {
      popoverRef = el
    },
    handleMouseEnter,
    handleMouseLeave,
  }
}
