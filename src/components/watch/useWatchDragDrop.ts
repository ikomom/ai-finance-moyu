import { createSignal, onCleanup } from 'solid-js'
import type { DropTarget } from './types'

export function useWatchDragDrop() {
  const [draggingIndex, setDraggingIndex] = createSignal<number | null>(null)
  const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null)
  let scrollAnimFrame: number | null = null

  const stopAutoScroll = () => {
    if (scrollAnimFrame !== null) {
      cancelAnimationFrame(scrollAnimFrame)
      scrollAnimFrame = null
    }
  }

  onCleanup(() => {
    stopAutoScroll()
  })

  const isDropBefore = (i: number) => {
    const dt = dropTarget()
    const dIdx = draggingIndex()
    if (!dt || dIdx === null || dIdx === i) return false
    if (dIdx < dt.index && dt.position === 'before' && dt.index - 1 === dIdx) return false
    if (dIdx > dt.index && dt.position === 'after' && dt.index + 1 === dIdx) return false
    return dt.index === i && dt.position === 'before'
  }

  const isDropAfter = (i: number) => {
    const dt = dropTarget()
    const dIdx = draggingIndex()
    if (!dt || dIdx === null || dIdx === i) return false
    if (dIdx < dt.index && dt.position === 'before' && dt.index - 1 === dIdx) return false
    if (dIdx > dt.index && dt.position === 'after' && dt.index + 1 === dIdx) return false
    return dt.index === i && dt.position === 'after'
  }

  const onHandlePointerDown = (
    e: PointerEvent,
    startIndex: number,
    totalCount: number,
    onMove: (from: number, to: number) => void,
    onToast?: (msg: string, kind?: '' | 'ok' | 'bad') => void
  ) => {
    if (e.button !== 0) return

    const startY = e.clientY
    let isDraggingActive = false
    let currentDropTarget: DropTarget | null = null

    const handleEl = e.currentTarget as HTMLElement
    const scrollContainer = handleEl.closest('.content-body') as HTMLElement | null
    const watchListEl = handleEl.closest('.watch-list') as HTMLElement | null

    const doAutoScroll = (clientY: number) => {
      if (!scrollContainer) return
      const rect = scrollContainer.getBoundingClientRect()
      const edgeThreshold = 45
      let speed = 0

      if (clientY < rect.top + edgeThreshold) {
        const intensity = Math.min(1, (rect.top + edgeThreshold - clientY) / edgeThreshold)
        speed = -Math.round(intensity * 12)
      } else if (clientY > rect.bottom - edgeThreshold) {
        const intensity = Math.min(1, (clientY - (rect.bottom - edgeThreshold)) / edgeThreshold)
        speed = Math.round(intensity * 12)
      }

      if (speed !== 0) {
        scrollContainer.scrollTop += speed
        updateDropTarget(clientY)
        scrollAnimFrame = requestAnimationFrame(() => doAutoScroll(clientY))
      } else {
        stopAutoScroll()
      }
    }

    const updateDropTarget = (clientY: number) => {
      if (!watchListEl) return
      const cards = Array.from(watchListEl.querySelectorAll<HTMLElement>('.watch'))
      if (cards.length === 0) return

      let foundTarget: DropTarget | null = null

      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]
        const rect = card.getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom) {
          const midY = rect.top + rect.height / 2
          foundTarget = {
            index: i,
            position: clientY < midY ? 'before' : 'after',
          }
          break
        }
      }

      if (!foundTarget && cards.length > 0) {
        const firstRect = cards[0].getBoundingClientRect()
        const lastRect = cards[cards.length - 1].getBoundingClientRect()
        if (clientY < firstRect.top) {
          foundTarget = { index: 0, position: 'before' }
        } else if (clientY > lastRect.bottom) {
          foundTarget = { index: cards.length - 1, position: 'after' }
        }
      }

      currentDropTarget = foundTarget
      setDropTarget(foundTarget)
    }

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!isDraggingActive) {
        if (Math.abs(moveEv.clientY - startY) > 3) {
          isDraggingActive = true
          setDraggingIndex(startIndex)
          document.body.style.userSelect = 'none'
          document.body.style.cursor = 'grabbing'
        }
      }

      if (isDraggingActive) {
        updateDropTarget(moveEv.clientY)
        stopAutoScroll()
        doAutoScroll(moveEv.clientY)
      }
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      stopAutoScroll()
      document.body.style.userSelect = ''
      document.body.style.cursor = ''

      if (isDraggingActive && currentDropTarget) {
        const from = startIndex
        const target = currentDropTarget.index
        const pos = currentDropTarget.position

        let to = from
        if (from < target) {
          to = pos === 'before' ? target - 1 : target
        } else if (from > target) {
          to = pos === 'before' ? target : target + 1
        }

        if (to !== from && to >= 0 && to < totalCount) {
          onMove(from, to)
          onToast?.('已调整自选股排序（点击底部保存生效）', 'ok')
        }
      }

      setDraggingIndex(null)
      setDropTarget(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  return {
    draggingIndex,
    dropTarget,
    isDropBefore,
    isDropAfter,
    onHandlePointerDown,
  }
}
