//! 主挂件常态 `focusable: false`：鼠标划过不会抢走别的应用正在输入的键盘焦点
//! （这也是老板键/防窥设计的一部分）。代价是任何输入框都收不到按键，
//! 所以用户主动点进输入框时临时把窗口切成可聚焦，离开后关回去。

import { invoke } from '@tauri-apps/api/core'
import { inTauri } from '../tauri'

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'

function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(EDITABLE)
}

export interface InputActivationOptions {
  /** 失去输入焦点后多久关回不可聚焦（毫秒）。默认 600。 */
  releaseDelayMs?: number
}

export function installInputActivation(opts: InputActivationOptions = {}): () => void {
  if (!inTauri()) return () => {}

  const releaseDelay = opts.releaseDelayMs ?? 600

  let activated = false
  const setActive = (on: boolean) => {
    if (on === activated) return
    activated = on
    void invoke('set_widget_focusable', { focusable: on }).catch(() => {})
  }

  // 用 mousedown 起手而不是等 focusin：窗口不可聚焦时，WebView 未必肯把焦点交给输入框，
  // 先把窗口激活，浏览器才会按正常流程走聚焦。
  const onMouseDown = (e: MouseEvent) => {
    if (isEditable(e.target as Element | null)) setActive(true)
  }

  const onFocusIn = (e: FocusEvent) => {
    if (isEditable(e.target as Element | null)) setActive(true)
  }

  // 在两个输入框之间切换时，focusout 早于下一个 focusin，延迟一拍再判断，
  // 否则刚离开上一个框就把窗口关回不可聚焦，下一个框又打不了字。
  // 延迟放宽：窗口样式来回切会让画面轻微重绘，弹窗里点来点去时别抖。
  const onFocusOut = () => {
    window.setTimeout(() => {
      if (!isEditable(document.activeElement)) setActive(false)
    }, releaseDelay)
  }

  // 用户不点空白、直接把鼠标移出挂件时不会有 focusout，这里补一刀，
  // 免得窗口长期停在"可聚焦"状态，违背最初不抢焦点的设计。
  const onMouseLeave = () => {
    if (!isEditable(document.activeElement)) setActive(false)
  }

  document.addEventListener('mousedown', onMouseDown, true)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('focusout', onFocusOut)
  document.addEventListener('mouseleave', onMouseLeave)

  return () => {
    document.removeEventListener('mousedown', onMouseDown, true)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
    document.removeEventListener('mouseleave', onMouseLeave)
  }
}
