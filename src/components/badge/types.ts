//! Types and definitions for unified badge ecosystem.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

import type { JSX } from 'solid-js'

export type BadgeTone = 'bull' | 'bear' | 'warn' | 'neutral'

export interface BaseBadgeProps {
  label: string
  tone: BadgeTone
  title?: string
  compact?: boolean
  showDetails?: boolean
  popover?: (setPopoverRef: (el: HTMLDivElement) => void) => JSX.Element
  children?: JSX.Element
}
