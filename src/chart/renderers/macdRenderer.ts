import { COLOR_DEA, COLOR_DIF, DOWN, FONT, UP } from '../theme'
import type { MacdDiagnosis } from '../types'

/**
 * 8-state MACD diagnosis used identically in intraday分时 and daily日K.
 */
export function diagnoseMacd(
  dif: number,
  dea: number,
  prevDif?: number | null,
  prevDea?: number | null
): MacdDiagnosis {
  const pDif = prevDif ?? dif
  const pDea = prevDea ?? dea

  if (pDif <= pDea && dif > dea) {
    if (dif >= 0) {
      return { text: '水上金叉', color: UP }
    } else {
      return { text: '低位金叉', color: '#fb923c' }
    }
  } else if (pDif >= pDea && dif < dea) {
    if (dif >= 0) {
      return { text: '高位死叉', color: '#a855f7' }
    } else {
      return { text: '水下死叉', color: DOWN }
    }
  } else if (dif >= dea) {
    return {
      text: dif >= 0 ? '水上多头' : '水下反弹',
      color: dif >= 0 ? 'rgba(239, 68, 68, 0.85)' : 'rgba(251, 146, 60, 0.85)',
    }
  } else {
    return {
      text: dif < 0 ? '水下空头' : '高位回调',
      color: dif < 0 ? 'rgba(34, 197, 94, 0.85)' : 'rgba(168, 85, 247, 0.85)',
    }
  }
}

export interface DrawMacdSubchartOptions {
  ctx: CanvasRenderingContext2D
  plotL: number
  plotW: number
  volT: number
  volH: number
  subPlotH: number
  series: Array<{ dif: number; dea: number; macd: number }>
  getX: (index: number) => number
  barWidth?: number
  activeIdx?: number | null
}

export function drawMacdSubchart(opts: DrawMacdSubchartOptions): void {
  const { ctx, plotL, plotW, volT, volH, subPlotH, series, getX } = opts
  if (series.length === 0) return

  let minM = 0
  let maxM = 0
  for (const m of series) {
    if (m.dif < minM) minM = m.dif
    if (m.dif > maxM) maxM = m.dif
    if (m.dea < minM) minM = m.dea
    if (m.dea > maxM) maxM = m.dea
    if (m.macd < minM) minM = m.macd
    if (m.macd > maxM) maxM = m.macd
  }
  if (minM === 0 && maxM === 0) {
    minM = -0.02
    maxM = 0.02
  }
  const spanM = Math.max(0.0001, (maxM - minM) * 1.15)
  const midM = (maxM + minM) / 2
  const macdMin = midM - spanM / 2
  const macdMax = midM + spanM / 2
  const yOfMacd = (v: number) => volT + volH - ((v - macdMin) / (macdMax - macdMin)) * subPlotH
  const zeroY = Math.round(yOfMacd(0)) + 0.5

  // Zero-axis dashed baseline
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  ctx.setLineDash([2, 2])
  ctx.beginPath()
  ctx.moveTo(plotL, zeroY)
  ctx.lineTo(plotL + plotW, zeroY)
  ctx.stroke()
  ctx.restore()

  // MACD Histogram Bars
  const histW = opts.barWidth ?? Math.max(1, (plotW / series.length) * 0.72)
  for (let i = 0; i < series.length; i++) {
    const m = series[i].macd
    const cx = getX(i)
    const my = yOfMacd(m)
    const barTop = Math.min(zeroY, my)
    const barHeight = Math.max(1, Math.abs(my - zeroY))
    ctx.fillStyle = m >= 0 ? 'rgba(239, 68, 68, 0.88)' : 'rgba(34, 197, 94, 0.88)'
    ctx.fillRect(cx - histW / 2, barTop, histW, barHeight)
  }

  // DIF line (#38bdf8)
  ctx.strokeStyle = COLOR_DIF
  ctx.lineWidth = 1.1
  ctx.beginPath()
  series.forEach((m, i) => {
    const cx = getX(i)
    const cy = yOfMacd(m.dif)
    if (i === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  })
  ctx.stroke()

  // DEA line (#f59e0b)
  ctx.strokeStyle = COLOR_DEA
  ctx.lineWidth = 1.1
  ctx.beginPath()
  series.forEach((m, i) => {
    const cx = getX(i)
    const cy = yOfMacd(m.dea)
    if (i === 0) ctx.moveTo(cx, cy)
    else ctx.lineTo(cx, cy)
  })
  ctx.stroke()

  // Legend: Active or latest point
  const activeIndex = opts.activeIdx != null && opts.activeIdx >= 0 && opts.activeIdx < series.length
    ? opts.activeIdx
    : series.length - 1

  const mActive = series[activeIndex]
  const prevM = activeIndex > 0 ? series[activeIndex - 1] : mActive

  if (mActive) {
    ctx.font = FONT
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let subLx = plotL + 2
    const subLy = volT + 1

    ctx.fillStyle = COLOR_DIF
    const difTxt = `DIF:${mActive.dif.toFixed(2)}`
    ctx.fillText(difTxt, subLx, subLy)
    subLx += ctx.measureText(difTxt).width + 6

    ctx.fillStyle = COLOR_DEA
    const deaTxt = `DEA:${mActive.dea.toFixed(2)}`
    ctx.fillText(deaTxt, subLx, subLy)
    subLx += ctx.measureText(deaTxt).width + 6

    ctx.fillStyle = mActive.macd >= 0 ? UP : DOWN
    const macdTxt = `MACD:${mActive.macd.toFixed(2)}`
    ctx.fillText(macdTxt, subLx, subLy)
    subLx += ctx.measureText(macdTxt).width + 6

    const diag = diagnoseMacd(mActive.dif, mActive.dea, prevM?.dif, prevM?.dea)
    if (diag.text) {
      ctx.fillStyle = diag.color
      ctx.fillText(diag.text, subLx, subLy)
    }
  }
}
