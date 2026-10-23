//! Unified Base Badge Container component.
//!
//! Provides standardized HTML shell, hover debouncing, tone styling,
//! and popover mount containment for StockBadge, KLineBadge, IndexBadge, and AuctionBadge.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

import { Show } from 'solid-js'
import { useBadgeHover } from './useBadgeHover'
import type { BaseBadgeProps } from './types'
import '../StockBadge.css'

export function BaseBadge(props: BaseBadgeProps) {
  const {
    hovered,
    setWrapRef,
    setPopoverRef,
    handleMouseEnter,
    handleMouseLeave,
  } = useBadgeHover(200)

  return (
    <div
      ref={setWrapRef}
      class={`stock-badge-wrap ${props.compact ? 'compact' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        class={`stock-badge ${props.tone}`}
        title={props.title}
      >
        {props.label}
      </span>

      <Show when={hovered() && (props.showDetails ?? true) && !props.compact}>
        {props.popover ? props.popover(setPopoverRef) : props.children}
      </Show>
    </div>
  )
}

export * from './types'
export * from './useBadgeHover'
