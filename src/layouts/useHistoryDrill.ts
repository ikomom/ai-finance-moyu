import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js'
import type { DayTrend, MultiDayTrend } from '../types'
import type { MiniMode } from './MiniBody'
import { fetchHistoricalDayTrend } from '../tauri'

export function useHistoryDrill(params: {
  quoteCode: Accessor<string | undefined>
  multiTrendCache: Accessor<Record<string, MultiDayTrend>>
  allDrillableDates?: Accessor<string[]>
  setManualMode: (mode: MiniMode) => void
  onClearHover: () => void
}) {
  const [historyDrillDay, setHistoryDrillDay] = createSignal<DayTrend | null>(null)
  const [drillOrigin, setDrillOrigin] = createSignal<'five_day' | 'kline'>('five_day')

  // Clear drill-down on security switch
  createEffect(() => {
    if (params.quoteCode()) setHistoryDrillDay(null)
  })

  const availableDates = () => {
    const list = params.allDrillableDates?.()
    if (list && list.length > 0) return list
    const c = params.quoteCode()
    return (c ? params.multiTrendCache()[c]?.days : undefined)?.map((d) => d.date.replace(/-/g, '').slice(0, 8)) ?? []
  }

  const currentIndex = () => {
    const cur = historyDrillDay()
    if (!cur) return -1
    const curKey = cur.date.replace(/-/g, '').slice(0, 8)
    return availableDates().indexOf(curKey)
  }

  const hasPrev = () => currentIndex() > 0
  const hasNext = () => {
    const idx = currentIndex()
    return idx >= 0 && idx < availableDates().length - 1
  }

  const stepHistoryDay = (delta: number) => {
    const dates = availableDates()
    const idx = currentIndex()
    if (idx < 0 || dates.length === 0) return
    const nextIdx = idx + delta
    if (nextIdx >= 0 && nextIdx < dates.length) {
      const targetDateKey = dates[nextIdx]
      const c = params.quoteCode()
      if (!c) return
      const memDay = params.multiTrendCache()[c]?.days.find(
        (d) => d.date.replace(/-/g, '').slice(0, 8) === targetDateKey
      )
      if (memDay) {
        setHistoryDrillDay(memDay)
        params.onClearHover()
      } else {
        void fetchHistoricalDayTrend(c, targetDateKey).then((diskDay) => {
          if (diskDay) {
            setHistoryDrillDay(diskDay)
            params.onClearHover()
          }
        })
      }
    }
  }

  const clearHistoryDrill = () => {
    setHistoryDrillDay(null)
  }

  const exitHistoryDrill = () => {
    const origin = drillOrigin()
    setHistoryDrillDay(null)
    params.setManualMode(origin === 'kline' ? 'kline' : 'five_day')
  }

  const enterHistoryDrill = (day: DayTrend, origin: 'five_day' | 'kline' = 'five_day') => {
    setDrillOrigin(origin)
    setHistoryDrillDay(day)
    params.setManualMode('trend')
  }

  // Escape key to exit drill
  createEffect(() => {
    if (!historyDrillDay()) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        exitHistoryDrill()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', onKeyDown))
  })

  const handleSideButton = (e: MouseEvent | PointerEvent) => {
    if (historyDrillDay() && (e.button === 3 || e.button === 4)) {
      e.preventDefault()
      e.stopPropagation()
      exitHistoryDrill()
    }
  }

  return {
    historyDrillDay,
    drillOrigin,
    hasPrevHistoryDay: hasPrev,
    hasNextHistoryDay: hasNext,
    stepHistoryDay,
    exitHistoryDrill,
    clearHistoryDrill,
    enterHistoryDrill,
    handleSideButton,
  }
}
