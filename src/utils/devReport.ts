import { snapshot } from '../store'
import { logToBackend } from '../tauri'

/**
 * Report what actually rendered in development mode.
 */
export function report(): void {
  if (!import.meta.env.DEV) return

  const s = snapshot()
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    const r = c.getBoundingClientRect()
    return (
      `${c.className} box=${Math.round(r.width)}x${Math.round(r.height)}` +
      ` attr=${c.width}x${c.height} dpr=${window.devicePixelRatio}` +
      ` pts=${c.dataset.points ?? 'n/a'} geom=${c.dataset.geom ?? 'n/a'}`
    )
  })

  const msg =
    `layout=${s?.config.layout} quotes=${s?.quotes.length ?? 0} ` +
    `trends=${s ? Object.keys(s.trends).length : 0} source=${s?.config.dataSource} ` +
    `viewport=${window.innerWidth}x${window.innerHeight} [${canvases.join(' | ')}]`

  document.body.dataset.diag = msg
  logToBackend(msg)
}
