// Boot diagnostics.
//
// A transparent/floating widget that fails to start shows *nothing at all* — no
// chrome, no error, just an invisible hole. This installs global error hooks
// before any component code runs so a boot failure paints a readable message.
//
// This used to be an inline `<script>` in the HTML entries. It lives in a module
// now because the app ships a strict `script-src 'self'` CSP: inline scripts
// would be blocked, and allowing `'unsafe-inline'` there would re-open inline
// event handlers (`<img onerror=…>`) as an XSS execution primitive.

const box = () => document.getElementById('boot-err')

export function showBootError(label: string, detail: string): void {
  const el = box()
  if (!el) return
  el.hidden = false
  el.textContent += `${label}: ${detail}\n`
}

export function installBootDiagnostics(): void {
  window.addEventListener('error', (ev) => {
    const where = ev.filename ? ` @ ${ev.filename}:${ev.lineno}` : ''
    showBootError('加载错误', `${ev.message || String(ev.error)}${where}`)
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason as { stack?: string; message?: string } | undefined
    showBootError('未处理的异常', reason?.stack || reason?.message || String(ev.reason))
  })
}
