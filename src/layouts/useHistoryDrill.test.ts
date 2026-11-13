import { describe, expect, it } from 'vitest'
import { createRoot, createSignal } from 'solid-js'
import { useHistoryDrill } from './useHistoryDrill'
import type { DayTrend, MultiDayTrend } from '../types'

describe('useHistoryDrill', () => {
  const dummyDays: DayTrend[] = [
    { date: '20261109', preClose: 10, points: [] },
    { date: '20261110', preClose: 10, points: [] },
    { date: '20261111', preClose: 10, points: [] },
  ]
  const dummyMultiTrend: Record<string, MultiDayTrend> = {
    sh600000: { code: 'sh600000', days: dummyDays },
  }

  it('keeps drillOrigin as kline and preserves manualMode on enter', () => {
    createRoot((dispose) => {
      const [code, _setCode] = createSignal<string | undefined>('sh600000')
      const [multiCache] = createSignal(dummyMultiTrend)
      let currentManualMode = 'kline'

      const drill = useHistoryDrill({
        quoteCode: code,
        multiTrendCache: multiCache,
        setManualMode: (m) => { currentManualMode = m },
        onClearHover: () => {},
      })

      drill.enterHistoryDrill(dummyDays[1], 'kline')
      expect(drill.historyDrillDay()?.date).toBe('20261110')
      expect(drill.drillOrigin()).toBe('kline')
      // manualMode should NOT be overwritten to 'trend'
      expect(currentManualMode).toBe('kline')

      drill.exitHistoryDrill()
      expect(drill.historyDrillDay()).toBeNull()
      expect(currentManualMode).toBe('kline')

      dispose()
    })
  })

  it('does not reset historyDrillDay when quoteCode emits same code, only on true switch', () => {
    createRoot((dispose) => {
      const [code, setCode] = createSignal<string | undefined>('sh600000')
      const [multiCache] = createSignal(dummyMultiTrend)

      const drill = useHistoryDrill({
        quoteCode: code,
        multiTrendCache: multiCache,
        setManualMode: () => {},
        onClearHover: () => {},
      })

      drill.enterHistoryDrill(dummyDays[1], 'kline')
      expect(drill.historyDrillDay()?.date).toBe('20261110')

      // Emitting same code (like reactive snapshot refresh) should NOT clear drill state
      setCode('sh600000')
      expect(drill.historyDrillDay()?.date).toBe('20261110')

      // Switching to a different security should clear drill state
      setCode('sz000001')
      expect(drill.historyDrillDay()).toBeNull()

      dispose()
    })
  })

  it('navigates dates with stepHistoryDay correctly', () => {
    createRoot((dispose) => {
      const [code] = createSignal<string | undefined>('sh600000')
      const [multiCache] = createSignal(dummyMultiTrend)

      const drill = useHistoryDrill({
        quoteCode: code,
        multiTrendCache: multiCache,
        setManualMode: () => {},
        onClearHover: () => {},
      })

      drill.enterHistoryDrill(dummyDays[1], 'kline') // 20261110
      expect(drill.historyDrillDay()?.date).toBe('20261110')

      // Step forward (+1)
      drill.stepHistoryDay(1)
      expect(drill.historyDrillDay()?.date).toBe('20261111')

      // Step backward (-1)
      drill.stepHistoryDay(-1)
      expect(drill.historyDrillDay()?.date).toBe('20261110')

      dispose()
    })
  })
})
