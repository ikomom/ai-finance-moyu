import type { KLineBar, TrendPoint } from '../types'

export interface MinuteMacd {
  dif: number
  dea: number
  macd: number
}

/**
 * 为日K线序列重算指定周期的移动平均线 (MA).
 * 默认周期为 [5, 10, 20].
 */
export function computeKLineMovingAverages(
  bars: KLineBar[],
  periods: [number, number, number] = [5, 10, 20]
): void {
  const [p1, p2, p3] = periods
  const n = bars.length
  for (let i = 0; i < n; i++) {
    if (i + 1 >= p1) {
      let sum = 0
      for (let k = i - p1 + 1; k <= i; k++) sum += bars[k].close
      bars[i].ma5 = Math.round((sum / p1) * 100) / 100
    } else {
      bars[i].ma5 = null
    }

    if (i + 1 >= p2) {
      let sum = 0
      for (let k = i - p2 + 1; k <= i; k++) sum += bars[k].close
      bars[i].ma10 = Math.round((sum / p2) * 100) / 100
    } else {
      bars[i].ma10 = null
    }

    if (i + 1 >= p3) {
      let sum = 0
      for (let k = i - p3 + 1; k <= i; k++) sum += bars[k].close
      bars[i].ma20 = Math.round((sum / p3) * 100) / 100
    } else {
      bars[i].ma20 = null
    }
  }
}

/**
 * 为日K线序列重算 MACD(fast, slow, signal) 指标.
 * 默认参数为 [12, 26, 9].
 */
export function computeKLineMacd(
  bars: KLineBar[],
  params: [number, number, number] = [12, 26, 9]
): void {
  const n = bars.length
  if (n === 0) return

  const [fast, slow, signal] = params
  const kFast = 2 / (fast + 1)
  const kSlow = 2 / (slow + 1)
  const kSignal = 2 / (signal + 1)

  let emaFast = bars[0].close
  let emaSlow = bars[0].close
  let dea = 0

  for (let i = 0; i < n; i++) {
    const c = bars[i].close
    if (i === 0) {
      emaFast = c
      emaSlow = c
      dea = 0
      bars[i].dif = 0
      bars[i].dea = 0
      bars[i].macd = 0
    } else {
      emaFast = emaFast * (1 - kFast) + c * kFast
      emaSlow = emaSlow * (1 - kSlow) + c * kSlow
      const dif = emaFast - emaSlow
      dea = dea * (1 - kSignal) + dif * kSignal
      const macd = (dif - dea) * 2
      bars[i].dif = Math.round(dif * 1000) / 1000
      bars[i].dea = Math.round(dea * 1000) / 1000
      bars[i].macd = Math.round(macd * 1000) / 1000
    }
  }
}

/**
 * 为分时 Tick 点阵计算日内平滑分钟级 MACD 序列.
 * 默认参数为 [12, 26, 9].
 */
export function computeMinuteMacd(
  points: TrendPoint[],
  params?: [number, number, number]
): MinuteMacd[] {
  const [fast, slow, signal] = params ?? [12, 26, 9]
  const n = points.length
  if (n === 0) return []
  const res: MinuteMacd[] = new Array(n)

  const kFast = 2 / (fast + 1)
  const kSlow = 2 / (slow + 1)
  const kSignal = 2 / (signal + 1)

  let emaFast = points[0].price
  let emaSlow = points[0].price
  let dea = 0

  for (let i = 0; i < n; i++) {
    const p = points[i].price
    if (i === 0) {
      emaFast = p
      emaSlow = p
      dea = 0
      res[i] = { dif: 0, dea: 0, macd: 0 }
    } else {
      emaFast = emaFast * (1 - kFast) + p * kFast
      emaSlow = emaSlow * (1 - kSlow) + p * kSlow
      const dif = emaFast - emaSlow
      dea = dea * (1 - kSignal) + dif * kSignal
      const macd = (dif - dea) * 2
      res[i] = {
        dif: Math.round(dif * 1000) / 1000,
        dea: Math.round(dea * 1000) / 1000,
        macd: Math.round(macd * 1000) / 1000,
      }
    }
  }
  return res
}
