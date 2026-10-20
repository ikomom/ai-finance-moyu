//! Volume / MACD subchart stage of the K-line renderer.

import { COLOR_MA10, COLOR_MA5 } from '../chart'
import type { KlinePaint } from './klinePaintTypes'

export function paintSubchart(c: KlinePaint): void {
  const { ctx, props, xOfIdx, yOfVol, volT, volH, subPlotH, plotL, plotW, slice, allBars, startIdx } = c

    // 3. Subchart (VOL vs MACD switchable)
    const subMode = props.subchartMode ?? 'vol'
    const barW = c.barW

    if (subMode === 'vol') {
      // 3a. Pure Volume bars (full contrast & crisp)
      for (let i = 0; i < slice.length; i++) {
        const b = slice[i]
        const cx = xOfIdx(i)
        const vy = yOfVol(b.volume)
        const vh = Math.max(1, volT + volH - vy)
        const isUp = b.close >= b.open

        ctx.fillStyle = isUp ? 'rgba(239, 68, 68, 0.85)' : 'rgba(34, 197, 94, 0.85)'
        ctx.fillRect(Math.round(cx - barW / 2), Math.round(vy), Math.round(barW), Math.round(vh))
      }

      // 3b. VOL MA5 & VOL MA10
      const drawVolMA = (period: number, color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.0
        ctx.beginPath()
        let started = false
        for (let i = 0; i < slice.length; i++) {
          const globalIdx = startIdx + i
          if (globalIdx + 1 >= period) {
            let sum = 0
            for (let k = globalIdx + 1 - period; k <= globalIdx; k++) {
              sum += allBars[k].volume
            }
            const avg = sum / period
            const x = xOfIdx(i)
            const y = yOfVol(avg)
            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else {
              ctx.lineTo(x, y)
            }
          }
        }
        if (started) ctx.stroke()
      }
      const [vp1, vp2] = props.maPeriods ?? [5, 10, 20]
      drawVolMA(vp1, COLOR_MA5)
      drawVolMA(vp2, COLOR_MA10)
    } else {
      // 3c. Pure MACD Subchart
      let minM = 0
      let maxM = 0
      for (const b of slice) {
        if (b.dif != null) {
          if (b.dif < minM) minM = b.dif
          if (b.dif > maxM) maxM = b.dif
        }
        if (b.dea != null) {
          if (b.dea < minM) minM = b.dea
          if (b.dea > maxM) maxM = b.dea
        }
        if (b.macd != null) {
          if (b.macd < minM) minM = b.macd
          if (b.macd > maxM) maxM = b.macd
        }
      }
      if (minM === 0 && maxM === 0) {
        minM = -0.05
        maxM = 0.05
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
      const histW = Math.max(1.5, Math.min(10, barW * 0.65))
      for (let i = 0; i < slice.length; i++) {
        const b = slice[i]
        const m = b.macd ?? 0
        const cx = xOfIdx(i)
        const my = yOfMacd(m)
        const barTop = Math.min(zeroY, my)
        const barHeight = Math.max(1, Math.abs(my - zeroY))
        const isMUp = m >= 0

        ctx.fillStyle = isMUp ? 'rgba(239, 68, 68, 0.88)' : 'rgba(34, 197, 94, 0.88)'
        ctx.fillRect(Math.round(cx - histW / 2), Math.round(barTop), Math.round(histW), Math.round(barHeight))
      }

      // DIF (#38bdf8) and DEA (#f59e0b) curves
      const drawMacdLine = (key: 'dif' | 'dea', color: string) => {
        ctx.strokeStyle = color
        ctx.lineWidth = 1.1
        ctx.beginPath()
        let started = false
        for (let i = 0; i < slice.length; i++) {
          const val = slice[i][key]
          if (val != null && Number.isFinite(val)) {
            const x = xOfIdx(i)
            const y = yOfMacd(val)
            if (!started) {
              ctx.moveTo(x, y)
              started = true
            } else {
              ctx.lineTo(x, y)
            }
          }
        }
        if (started) ctx.stroke()
      }
      drawMacdLine('dif', '#38bdf8')
      drawMacdLine('dea', '#f59e0b')
    }

}
