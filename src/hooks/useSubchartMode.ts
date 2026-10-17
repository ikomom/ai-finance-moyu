import { createSignal } from 'solid-js'

export type SubchartMode = 'vol' | 'macd'

const STORAGE_KEY = 'moyu_subchart_mode'

/**
 * 集中管理副图模式 ('vol' 成交量 | 'macd' 指标) 并持久化至 localStorage.
 */
export function useSubchartMode(defaultMode: SubchartMode = 'vol') {
  const initialMode = (): SubchartMode => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY) as SubchartMode | null
        if (saved === 'vol' || saved === 'macd') {
          return saved
        }
      }
    } catch {}
    return defaultMode
  }

  const [subchartMode, setSubchartMode] = createSignal<SubchartMode>(initialMode())

  const toggleSubchartMode = (mode: SubchartMode) => {
    setSubchartMode(mode)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, mode)
      }
    } catch {}
  }

  return {
    subchartMode,
    setSubchartMode: toggleSubchartMode,
  }
}
