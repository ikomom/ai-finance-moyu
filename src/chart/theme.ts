import { AVG, DOWN, UP } from '../types'

export const FONT = '9px ui-monospace, "SF Mono", Menlo, Consolas, monospace'

export function getChartTheme() {
  const theme = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : 'dark'
  if (theme === 'light') {
    return {
      grid: 'rgba(0, 0, 0, 0.08)',
      axisText: 'rgba(0, 0, 0, 0.55)',
      preCloseLine: 'rgba(0, 0, 0, 0.35)',
      lineColor: 'rgba(0, 0, 0, 0.65)',
      costLine: '#0284c7',
      up: '#dc2626',
      down: '#16a34a',
      avg: '#2563eb',
      font: FONT,
    }
  }
  if (theme === 'cyberpunk') {
    return {
      grid: 'rgba(0, 255, 136, 0.12)',
      axisText: 'rgba(0, 255, 136, 0.65)',
      preCloseLine: 'rgba(0, 255, 136, 0.35)',
      lineColor: 'rgba(0, 255, 136, 0.8)',
      costLine: '#00e5ff',
      up: '#ff3366',
      down: '#00ff88',
      avg: '#00e5ff',
      font: FONT,
    }
  }
  if (theme === 'ocean') {
    return {
      grid: 'rgba(56, 189, 248, 0.12)',
      axisText: 'rgba(125, 211, 252, 0.55)',
      preCloseLine: 'rgba(56, 189, 248, 0.35)',
      lineColor: 'rgba(56, 189, 248, 0.75)',
      costLine: '#38bdf8',
      up: '#f43f5e',
      down: '#10b981',
      avg: '#0ea5e9',
      font: FONT,
    }
  }
  return {
    grid: 'rgba(255, 255, 255, 0.07)',
    axisText: 'rgba(255, 255, 255, 0.42)',
    preCloseLine: 'rgba(255, 255, 255, 0.28)',
    lineColor: 'rgba(255, 255, 255, 0.55)',
    costLine: '#22d3ee',
    up: UP,
    down: DOWN,
    avg: AVG,
    font: FONT,
  }
}

export const GRID = 'rgba(255, 255, 255, 0.07)'
export const AXIS_TEXT = 'rgba(255, 255, 255, 0.42)'
export const PRE_CLOSE_LINE = 'rgba(255, 255, 255, 0.28)'
export const COST_LINE = '#22d3ee'
export const LINE_COLOR = 'rgba(255, 255, 255, 0.55)'

export const COLOR_MA5 = '#f59e0b'
export const COLOR_MA10 = '#c084fc'
export const COLOR_MA20 = '#38bdf8'

export const COLOR_DIF = '#38bdf8'
export const COLOR_DEA = '#f59e0b'

export const DIVIDER_LINE = 'rgba(245, 158, 11, 0.75)'

export { UP, DOWN, AVG }
