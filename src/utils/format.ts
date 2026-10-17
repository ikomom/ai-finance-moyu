export {
  fmtHHMM,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtSigned,
  fmtVol,
} from '../types'

/**
 * 格式化形如 930 或 1345 的整型时间为 "09:30" 或 "13:45".
 */
export function fmtTime(t: number): string {
  const h = Math.floor(t / 100).toString().padStart(2, '0')
  const m = (t % 100).toString().padStart(2, '0')
  return `${h}:${m}`
}
