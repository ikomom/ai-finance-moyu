import { createEffect, onCleanup, onMount } from 'solid-js'
import { setTrendTargets } from '../tauri'
import type { Quote, WatchItem } from '../types'

export interface TotalStats {
  totalToday: number
  totalFloating: number
  floatingPct: number | null
}

/**
 * Computes portfolio-level total profit and percentage relative to holding costs.
 */
export function computeTotalStats(
  quotes: Quote[] | undefined,
  watchlist: WatchItem[] | undefined
): TotalStats | null {
  if (!quotes || !watchlist) return null
  let totalToday = 0
  let totalFloating = 0
  let totalCost = 0
  let hasShares = false

  for (const q of quotes) {
    const it = watchlist.find((w) => w.code === q.code)
    if (it?.shares && it.shares > 0) {
      hasShares = true
      if (q.price > 0) {
        if (q.preClose > 0) {
          totalToday += (q.price - q.preClose) * it.shares
        }
        if (it.costPrice != null && it.costPrice > 0) {
          totalFloating += (q.price - it.costPrice) * it.shares
          totalCost += it.costPrice * it.shares
        }
      }
    }
  }

  if (!hasShares) return null
  const floatingPct = totalCost > 0 ? (totalFloating / totalCost) * 100 : null
  return { totalToday, totalFloating, floatingPct }
}

/**
 * Manages scroll-aware trend subscriptions for high-density watchlist tables.
 */
export function useListScroll(
  getQuotes: () => Quote[] | undefined,
  getTableRef: () => HTMLDivElement | undefined
) {
  let lastReportedTargets = ''
  let scrollTimer: number | null = null

  const BUFFER_ROWS = 4
  const ESTIMATED_ROW_HEIGHT = 28

  const updateVisibleTargets = () => {
    const quotesList = getQuotes() ?? []
    if (quotesList.length === 0) {
      if (lastReportedTargets !== '') {
        lastReportedTargets = ''
        setTrendTargets([])
      }
      return
    }

    if (quotesList.length <= 15) {
      const codes = quotesList.map((q) => q.code)
      const key = codes.join(',')
      if (key !== lastReportedTargets) {
        lastReportedTargets = key
        setTrendTargets(codes)
      }
      return
    }

    const tableBodyRef = getTableRef()
    if (!tableBodyRef) {
      const initialCodes = quotesList.slice(0, 15).map((q) => q.code)
      const key = initialCodes.join(',')
      if (key !== lastReportedTargets) {
        lastReportedTargets = key
        setTrendTargets(initialCodes)
      }
      return
    }

    const scrollTop = tableBodyRef.scrollTop
    const clientHeight = tableBodyRef.clientHeight || 200
    const rowHeight = tableBodyRef.firstElementChild?.clientHeight || ESTIMATED_ROW_HEIGHT

    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS)
    const endIdx = Math.min(
      quotesList.length,
      Math.ceil((scrollTop + clientHeight) / rowHeight) + BUFFER_ROWS
    )

    const targetCodes = quotesList.slice(startIdx, endIdx).map((q) => q.code)
    const key = targetCodes.join(',')
    if (key !== lastReportedTargets) {
      lastReportedTargets = key
      setTrendTargets(targetCodes)
    }
  }

  const handleScroll = () => {
    if (scrollTimer !== null) return
    scrollTimer = window.setTimeout(() => {
      scrollTimer = null
      updateVisibleTargets()
    }, 100)
  }

  onMount(() => {
    updateVisibleTargets()
    const tableBodyRef = getTableRef()
    if (tableBodyRef) {
      const observer = new ResizeObserver(() => {
        updateVisibleTargets()
      })
      observer.observe(tableBodyRef)
      onCleanup(() => observer.disconnect())

      requestAnimationFrame(() => {
        const activeEl = tableBodyRef.querySelector('.table-row.active') as HTMLElement | null
        if (activeEl) {
          activeEl.scrollIntoView({ block: 'nearest', behavior: 'auto' })
        }
      })
    }
    onCleanup(() => {
      if (scrollTimer !== null) {
        window.clearTimeout(scrollTimer)
        scrollTimer = null
      }
    })
  })

  createEffect(() => {
    getQuotes()?.length
    requestAnimationFrame(updateVisibleTargets)
  })

  return { handleScroll }
}
