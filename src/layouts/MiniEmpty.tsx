import { Show } from 'solid-js'
import { emit } from '@tauri-apps/api/event'
import { StatusLine } from '../components/StatusLine'
import type { PollStatus, WatchItem } from '../types'

export function MiniEmpty(props: { item?: WatchItem; status?: PollStatus }) {
  return (
    <div class="mini-empty">
      <div class="mini-empty-main">
        <Show
          when={props.item}
          fallback={
            <>
              <svg class="mini-empty-art" viewBox="0 0 56 34" aria-hidden="true">
                <polyline
                  points="1,27 12,19 21,23 31,11 41,16 55,5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <line x1="1" y1="31" x2="55" y2="31" stroke="currentColor" stroke-width="1" opacity="0.3" />
                <circle cx="31" cy="11" r="2.2" fill="currentColor" opacity="0.65" />
              </svg>
              <span class="mini-empty-title">这个分组还没有股票</span>
              <span class="mini-empty-hint">右键添加，或直接搜一只加进来</span>
              <button
                type="button"
                class="mini-empty-add"
                onClick={(e) => {
                  e.stopPropagation()
                  void emit('open-quick-add-modal')
                }}
              >
                ＋ 添加自选
              </button>
            </>
          }
        >
          <span class="mini-empty-title">{props.item?.code}</span>
          <span class="mini-empty-hint">正在等待这只股票的行情…</span>
        </Show>
      </div>
      <Show when={props.status}>
        {(st) => <StatusLine status={st()} />}
      </Show>
    </div>
  )
}
