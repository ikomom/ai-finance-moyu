import { Show } from 'solid-js'

import { clearToast, navigateToStock, toastAlert } from '../store'

/** Transient message, used for failures and alerts. */
export function Toast() {
  const alert = () => toastAlert()

  return (
    <Show when={alert()}>
      {(item) => (
        <div
          class="toast"
          classList={{ clickable: !!item().code || !!item().onClick }}
          title={item().code ? '点击查看分时图' : item().onClick ? '点击查看' : undefined}
          onClick={() => {
            if (item().onClick) {
              item().onClick!()
            } else if (item().code) {
              navigateToStock(item().code!, 'trend')
            }
            clearToast()
          }}
        >
          <span class="toast-msg">{item().message}</span>
          <Show when={item().code || item().onClick}>
            <span class="toast-hint">查看 ➔</span>
          </Show>
        </div>
      )}
    </Show>
  )
}
