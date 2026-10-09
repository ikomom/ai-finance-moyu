import { Show } from 'solid-js'

import { toastMsg } from '../store'

/** Transient message, used for failures the user should notice. */
export function Toast() {
  return (
    <Show when={toastMsg()}>
      {(msg) => <div class="toast">{msg()}</div>}
    </Show>
  )
}
