import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import type { SubchartMode } from '../hooks/useSubchartMode'
import type { KlinePeriod } from '../types'
import './FooterControls.css'

export type ViewMode = 'trend' | 'five_day' | 'kline' | 'auction'

export const KLINE_PERIODS: { id: KlinePeriod; label: string }[] = [
  { id: '15m', label: '15分' },
  { id: '30m', label: '30分' },
  { id: '60m', label: '60分' },
  { id: '120m', label: '120分' },
  { id: 'day', label: '日K' },
  { id: 'week', label: '周K' },
]

export interface FooterControlsProps {
  subchartMode?: SubchartMode
  onToggleSubchart?: (mode: SubchartMode) => void
  viewMode?: ViewMode
  onToggleView?: (mode: ViewMode) => void
  showSubchart?: boolean
  showAuction?: boolean
  klinePeriod?: KlinePeriod
  onSelectPeriod?: (period: KlinePeriod) => void
}

export const STORAGE_KEY_TREND_SUBMODE = 'trend_view_submode'
export const getSavedTrendSubmode = (): 'trend' | 'five_day' => {
  try {
    const val = localStorage.getItem(STORAGE_KEY_TREND_SUBMODE)
    if (val === 'five_day' || val === 'trend') return val
  } catch {}
  return 'trend'
}

/**
 * 迷你/看板通用的底栏副图与走势模式切换胶囊控制组 (分时 / 多周期K线).
 */
export function FooterControls(props: FooterControlsProps) {
  const [klinePopoverOpen, setKlinePopoverOpen] = createSignal(false)
  const [trendPopoverOpen, setTrendPopoverOpen] = createSignal(false)
  let klinePopoverRef: HTMLDivElement | undefined
  let klineArrowBtnRef: HTMLButtonElement | undefined
  let trendPopoverRef: HTMLDivElement | undefined
  let trendArrowBtnRef: HTMLButtonElement | undefined

  const showSubchart = () => props.showSubchart ?? true
  const currentPeriod = () => props.klinePeriod ?? 'day'
  const currentPeriodLabel = () =>
    KLINE_PERIODS.find((p) => p.id === currentPeriod())?.label ?? '日K'

  onMount(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (
        klinePopoverOpen() &&
        target &&
        !klinePopoverRef?.contains(target) &&
        !klineArrowBtnRef?.contains(target)
      ) {
        setKlinePopoverOpen(false)
      }
      if (
        trendPopoverOpen() &&
        target &&
        !trendPopoverRef?.contains(target) &&
        !trendArrowBtnRef?.contains(target)
      ) {
        setTrendPopoverOpen(false)
      }
    }
    window.addEventListener('pointerdown', handleOutsideClick)
    onCleanup(() => window.removeEventListener('pointerdown', handleOutsideClick))
  })

  return (
    <div class="mini-footer-actions">
      {/* 副图切换胶囊: 量 / MACD */}
      <Show when={showSubchart() && props.subchartMode && props.onToggleSubchart}>
        <div class="mode-pill-group">
          <button
            type="button"
            class="mode-pill"
            classList={{ active: props.subchartMode === 'vol' }}
            onClick={() => props.onToggleSubchart!('vol')}
            title="切换副图：成交量 (VOL)"
          >
            量
          </button>
          <button
            type="button"
            class="mode-pill"
            classList={{ active: props.subchartMode === 'macd' }}
            onClick={() => props.onToggleSubchart!('macd')}
            title="切换副图：MACD指标"
          >
            MACD
          </button>
        </div>
      </Show>

      {/* 视图形态切换胶囊: 分时 / 周期K (分离式按钮) */}
      <Show when={props.viewMode && props.onToggleView}>
        <div class="mode-pill-group">
          {/* 分时 / 5日 分离式按钮 */}
          <div class="split-pill-container">
            <button
              type="button"
              class="mode-pill trend-main-pill"
              classList={{ active: props.viewMode === 'trend' || props.viewMode === 'five_day' || props.viewMode === 'auction' }}
              onClick={() => {
                setKlinePopoverOpen(false)
                setTrendPopoverOpen(false)
                if (props.viewMode === 'trend') {
                  try { localStorage.setItem(STORAGE_KEY_TREND_SUBMODE, 'five_day') } catch {}
                  props.onToggleView!('five_day')
                } else if (props.viewMode === 'five_day') {
                  try { localStorage.setItem(STORAGE_KEY_TREND_SUBMODE, 'trend') } catch {}
                  props.onToggleView!('trend')
                } else {
                  props.onToggleView!(getSavedTrendSubmode())
                }
              }}
              title={props.viewMode === 'five_day' ? '当前：五日分时走势 (点击切换为当日分时)' : '当前：分时走势 (点击切换)'}
            >
              {props.viewMode === 'five_day' || (props.viewMode === 'kline' && getSavedTrendSubmode() === 'five_day') ? '5日' : '分时'}
            </button>
            <button
              ref={trendArrowBtnRef}
              type="button"
              class="mode-pill trend-arrow-pill"
              classList={{ active: trendPopoverOpen() || props.viewMode === 'trend' || props.viewMode === 'five_day' }}
              onClick={(e) => {
                e.stopPropagation()
                setKlinePopoverOpen(false)
                setTrendPopoverOpen(!trendPopoverOpen())
              }}
              title="切换当日分时 / 5日分时"
            >
              ▾
            </button>

            {/* 上浮分时菜单 */}
            <Show when={trendPopoverOpen()}>
              <div ref={trendPopoverRef} class="kline-period-popover trend-period-popover" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  class="period-item"
                  classList={{ active: props.viewMode === 'trend' || props.viewMode === 'auction' }}
                  onClick={() => {
                    try { localStorage.setItem(STORAGE_KEY_TREND_SUBMODE, 'trend') } catch {}
                    props.onToggleView?.('trend')
                    setTrendPopoverOpen(false)
                  }}
                >
                  当日
                </button>
                <button
                  type="button"
                  class="period-item"
                  classList={{ active: props.viewMode === 'five_day' }}
                  onClick={() => {
                    try { localStorage.setItem(STORAGE_KEY_TREND_SUBMODE, 'five_day') } catch {}
                    props.onToggleView?.('five_day')
                    setTrendPopoverOpen(false)
                  }}
                >
                  5日
                </button>
              </div>
            </Show>
          </div>

          <div class="split-pill-container">
            <button
              type="button"
              class="mode-pill kline-main-pill"
              classList={{ active: props.viewMode === 'kline' }}
              onClick={() => {
                setKlinePopoverOpen(false)
                setTrendPopoverOpen(false)
                props.onToggleView!('kline')
              }}
              title={`${currentPeriodLabel()}线及均线系统`}
            >
              {currentPeriodLabel()}
            </button>
            <button
              ref={klineArrowBtnRef}
              type="button"
              class="mode-pill kline-arrow-pill"
              classList={{ active: klinePopoverOpen() || props.viewMode === 'kline' }}
              onClick={(e) => {
                e.stopPropagation()
                setTrendPopoverOpen(false)
                setKlinePopoverOpen(!klinePopoverOpen())
              }}
              title="选择K线周期 (15分/30分/60分/120分/日K/周K)"
            >
              ▾
            </button>

            {/* 上浮K线周期菜单 */}
            <Show when={klinePopoverOpen()}>
              <div ref={klinePopoverRef} class="kline-period-popover" onClick={(e) => e.stopPropagation()}>
                <For each={KLINE_PERIODS}>
                  {(p) => (
                    <button
                      type="button"
                      class="period-item"
                      classList={{ active: currentPeriod() === p.id }}
                      onClick={() => {
                        props.onSelectPeriod?.(p.id)
                        props.onToggleView?.('kline')
                        setKlinePopoverOpen(false)
                      }}
                    >
                      {p.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
