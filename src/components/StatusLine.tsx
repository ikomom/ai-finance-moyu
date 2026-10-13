import { Show } from 'solid-js'

import type { PollStatus } from '../types'

const SESSION_LABEL: Record<string, string> = {
  PreOpen: '未开盘',
  CallAuctionCancelable: '竞价 · 可撤',
  CallAuctionLocked: '竞价 · 锁定',
  CallAuction: '集合竞价',
  PreTrade: '待开盘',
  Morning: '上午盘',
  LunchBreak: '午间休市',
  Afternoon: '下午盘',
  ClosingAuction: '尾盘竞价',
  Closed: '已收盘',
}

/** Connection health, last update time and which part of the session we're in. */
export function StatusLine(props: { status: PollStatus }) {
  const live = () =>
    props.status.tradingToday &&
    [
      'Morning',
      'Afternoon',
      'CallAuctionCancelable',
      'CallAuctionLocked',
      'CallAuction',
      'ClosingAuction',
    ].includes(props.status.session)

  // A feed date that isn't today means the market is closed (weekend/holiday),
  // and what's on screen is the most recent session.
  const parts = () => {
    const st = props.status
    const out = [SESSION_LABEL[st.session] ?? st.session]
    if (!st.tradingToday && st.feedDate) out.push(`数据 ${fmtDate(st.feedDate)}`)
    if (st.lastUpdate) out.push(st.lastUpdate)
    return out.join(' · ')
  }

  return (
    <div class="status">
      <Show
        when={props.status.error}
        fallback={
          <>
            <span class={`dot ${live() ? 'live' : 'closed'}`} />
            {parts()}
          </>
        }
      >
        {(err) => (
          <>
            <span class="dot error" />
            <span class="err">{truncate(err(), 40)}</span>
          </>
        )}
      </Show>
    </div>
  )
}

/** `20261008` -> `10-08`. */
function fmtDate(ymd: string): string {
  if (ymd.length !== 8) return ymd
  return `${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
