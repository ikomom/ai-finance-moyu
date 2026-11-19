import { createEffect, createSignal, onCleanup, Show, type JSX } from 'solid-js'
import { fmtPct, fmtPrice, trendClass, type Quote } from '../types'
import { MicroTapePopover } from './tape/MicroTapePopover'
import './StockHeader.css'

export interface StockHeaderProps {
  name: string
  code: string
  price: number
  changePct: number
  activePrice?: number
  activePct?: number
  high?: number | null
  low?: number | null
  badge?: JSX.Element
  hoverTime?: string | null
  hoverExtra?: string | null
  extraInfo?: JSX.Element
  quote?: Quote
}

/**
 * 迷你/看板通用的标头与大字行情组件 (包含代码名称、徽标槽、日内极值、大字价格、动态 Hover 指示与副信息槽).
 */
export function StockHeader(props: StockHeaderProps) {
  const currentPrice = () => (props.activePrice != null ? props.activePrice : props.price)
  const currentPct = () => (props.activePct != null ? props.activePct : props.changePct)
  const displayCode = () => props.code.replace(/^(sh|sz|bj|us|hk|gz)/, '')

  const [showTape, setShowTape] = createSignal(false)
  const [isPinned, setIsPinned] = createSignal(false)
  let hoverTimer: number | undefined
  let leaveTimer: number | undefined
  let headerRef: HTMLDivElement | undefined

  const clearTimers = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer)
      hoverTimer = undefined
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = undefined
    }
  }

  const handleMouseEnter = () => {
    if (!props.quote) return
    clearTimers()
    hoverTimer = window.setTimeout(() => {
      setShowTape(true)
    }, 300)
  }

  const handleMouseLeave = () => {
    clearTimers()
    if (!isPinned()) {
      leaveTimer = window.setTimeout(() => {
        if (!isPinned()) {
          setShowTape(false)
        }
      }, 150)
    }
  }

  const togglePin = () => {
    clearTimers()
    setIsPinned((prev) => !prev)
    setShowTape(true)
  }

  // Keyboard and outside click dismiss when pinned
  createEffect(() => {
    if (!isPinned()) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPinned(false)
        setShowTape(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (headerRef && !headerRef.contains(e.target as Node)) {
        setIsPinned(false)
        setShowTape(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('click', handleClickOutside)
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('click', handleClickOutside)
    })
  })

  onCleanup(() => {
    clearTimers()
  })

  return (
    <div
      ref={headerRef}
      class="stock-header-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 头部元数据栏 */}
      <div class="mini-meta" data-tauri-drag-region>
        <div class="meta-left">
          <span class="name">{props.name}</span>
          <span class="code">{displayCode()}</span>
          <Show when={props.badge}>{props.badge}</Show>
        </div>
        <div class="meta-right">
          <Show when={props.high != null && props.low != null}>
            <div class="stats-text">
              <span>高 <b class="up">{fmtPrice(props.high!, 2)}</b></span>
              <span>低 <b class="down">{fmtPrice(props.low!, 2)}</b></span>
            </div>
          </Show>
          <Show when={props.quote}>
            <button
              type="button"
              class="tape-trigger-btn"
              classList={{ active: isPinned() || showTape() }}
              title="核心盘口：换手/量比/成交额/市值 (点击锁定，悬停预览)"
              onClick={(e) => {
                e.stopPropagation()
                togglePin()
              }}
            >
              盘口
            </button>
          </Show>
        </div>
      </div>

      {/* 大字行情与信息指示栏 */}
      <div class="mini-price-row">
        <span class={`big-price ${props.price > 0 ? trendClass(currentPct()) : 'flat'}`}>
          {props.price > 0 ? fmtPrice(currentPrice(), 2) : '--'}
        </span>
        <span class={`big-pct ${props.price > 0 ? trendClass(currentPct()) : 'flat'}`}>
          {props.price > 0 ? fmtPct(currentPct()) : '--'}
        </span>
        <Show
          when={props.hoverTime}
          fallback={
            <Show when={props.extraInfo}>
              {props.extraInfo}
            </Show>
          }
        >
          <span class="hover-time-tag">
            {props.hoverTime}
            {props.hoverExtra ? ` · ${props.hoverExtra}` : ''}
          </span>
        </Show>
      </div>

      {/* 核心微盘口浮层 */}
      <Show when={props.quote && (showTape() || isPinned())}>
        <MicroTapePopover
          quote={props.quote!}
          isPinned={isPinned()}
          onClose={() => {
            setIsPinned(false)
            setShowTape(false)
          }}
          onTogglePin={togglePin}
        />
      </Show>
    </div>
  )
}
