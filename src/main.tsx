import { render } from 'solid-js/web'

import { installBootDiagnostics, showBootError } from './boot'
import { Widget } from './Widget'
import './styles.css'

installBootDiagnostics()
showBootError('引导', '前端模块已加载，等待挂载…')

const root = document.getElementById('root')
if (root) {
  render(() => <Widget />, root)

  // The overlay exists to explain a *failure to start*, when a transparent
  // widget would otherwise show nothing at all. The app mounted, so clear it —
  // `initStore` runs inside the component and surfaces its own errors in the
  // card. The listeners stay armed, so a later unhandled rejection brings the
  // overlay back.
  document.getElementById('boot-err')?.setAttribute('hidden', '')
}
