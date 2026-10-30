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

/**
 * 为日K线序列重算 KDJ(9, 3, 3) 指标 (后台静默运算，供决策引擎使用).
 */
export function computeKLineKdj(
  bars: KLineBar[],
  params: [number, number, number] = [9, 3, 3]
): void {
  const n = bars.length
  if (n === 0) return
  const [period, m1, m2] = params

  let prevK = 50.0
  let prevD = 50.0

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - period + 1)
    let lowest = Infinity
    let highest = -Infinity
    for (let k = start; k <= i; k++) {
      if (bars[k].low < lowest) lowest = bars[k].low
      if (bars[k].high > highest) highest = bars[k].high
    }

    const c = bars[i].close
    const rsv =
      Math.abs(highest - lowest) < 1e-6
        ? 50.0
        : Math.min(100.0, Math.max(0.0, ((c - lowest) / (highest - lowest)) * 100.0))

    const k = (1 / m1) * rsv + ((m1 - 1) / m1) * prevK
    const d = (1 / m2) * k + ((m2 - 1) / m2) * prevD
    const j = 3 * k - 2 * d

    bars[i].k = Math.round(k * 10) / 10
    bars[i].d = Math.round(d * 10) / 10
    bars[i].j = Math.round(j * 10) / 10

    prevK = k
    prevD = d
  }
}

/**
 * 计算日K序列的前 5 日滚动支撑位与阻力位 (排除当前Bar).
 */
export function computeKLineLevels(
  bars: KLineBar[]
): { support: number | null; resistance: number | null } {
  const n = bars.length
  if (n < 2) return { support: null, resistance: null }

  const start = Math.max(0, n - 6)
  const end = n - 1
  let sup = Infinity
  let res = -Infinity

  for (let i = start; i < end; i++) {
    if (bars[i].high > res) res = bars[i].high
    if (bars[i].low < sup) sup = bars[i].low
  }

  return {
    support: sup !== Infinity ? Math.round(sup * 100) / 100 : null,
    resistance: res !== -Infinity ? Math.round(res * 100) / 100 : null,
  }
}

export function resolveIndicatorParams(
  item?: import('../types').WatchItem | null,
  global?: import('../types').IndicatorConfig | null
): { ma: [number, number, number]; macd: [number, number, number] } {
  const presets = {
    ultra_short: { ma: [3, 5, 10] as [number, number, number], macd: [6, 13, 5] as [number, number, number] },
    classic: { ma: [5, 10, 20] as [number, number, number], macd: [12, 26, 9] as [number, number, number] },
    swing: { ma: [10, 20, 60] as [number, number, number], macd: [12, 26, 9] as [number, number, number] },
  }
  const effectiveGlobal = global ?? { preset: 'classic', ma: [5, 10, 20], macd: [12, 26, 9] }
  const mode = item?.indicatorMode ?? 'inherit'

  if (mode === 'ultra_short') return presets.ultra_short
  if (mode === 'classic') return presets.classic
  if (mode === 'swing') return presets.swing
  if (mode === 'custom') {
    return {
      ma: item?.customMa ?? effectiveGlobal.ma ?? [5, 10, 20],
      macd: item?.customMacd ?? effectiveGlobal.macd ?? [12, 26, 9],
    }
  }
  if (effectiveGlobal.preset === 'ultra_short') return presets.ultra_short
  if (effectiveGlobal.preset === 'swing') return presets.swing
  if (effectiveGlobal.preset === 'custom') {
    return {
      ma: effectiveGlobal.ma ?? [5, 10, 20],
      macd: effectiveGlobal.macd ?? [12, 26, 9],
    }
  }
  return presets.classic
}
