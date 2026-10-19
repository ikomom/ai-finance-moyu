import { createSignal } from 'solid-js'

export const [isAgentDrawerOpen, setIsAgentDrawerOpen] = createSignal(false)

export function toggleAgentDrawer() {
  setIsAgentDrawerOpen(!isAgentDrawerOpen())
}

export function openAgentDrawer() {
  setIsAgentDrawerOpen(true)
}

export function closeAgentDrawer() {
  setIsAgentDrawerOpen(false)
}
