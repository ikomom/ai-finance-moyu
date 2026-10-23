//! Viewport boundary clamping for popover cards.
//! Ensures 308px popovers stay completely within the Mini widget bounds without clipping.

export function adjustPopoverPosition(
  wrapEl?: HTMLElement | null,
  popoverEl?: HTMLElement | null
): void {
  if (!wrapEl || !popoverEl) return
  requestAnimationFrame(() => {
    if (!wrapEl || !popoverEl) return
    const wrapRect = wrapEl.getBoundingClientRect()
    const popoverWidth = popoverEl.offsetWidth || 308
    const windowWidth = window.innerWidth
    const overflowRight = wrapRect.left + popoverWidth - (windowWidth - 8)
    if (overflowRight > 0) {
      const shift = Math.min(overflowRight, Math.max(0, wrapRect.left - 8))
      popoverEl.style.left = `-${shift}px`
      popoverEl.style.right = 'auto'
    } else {
      popoverEl.style.left = '0px'
      popoverEl.style.right = 'auto'
    }
  })
}
