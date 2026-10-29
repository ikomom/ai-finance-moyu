import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import type { SubchartMode } from '../hooks/useSubchartMode'
import type { KlinePeriod } from '../types'
import './FooterControls.css'

export type ViewMode = 'trend' | 'kline' | 'auction'

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

/**
 * 迷你/看板通用的底栏副图与走势模式切换胶囊控制组 (分时 / 多周期K线).
 */
export function FooterControls(props: FooterControlsProps) {
  const [popoverOpen, setPopoverOpen] = createSignal(false)
  let popoverRef: HTMLDivElement | undefined
  let arrowBtnRef: HTMLButtonElement | undefined

  const showSubchart = () => props.showSubchart ?? true
  const currentPeriod = () => props.klinePeriod ?? 'day'
  const currentPeriodLabel = () =>
    KLINE_PERIODS.find((p) => p.id === currentPeriod())?.label ?? '日K'

  onMount(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (
        popoverOpen() &&
        target &&
        !popoverRef?.contains(target) &&
        !arrowBtnRef?.contains(target)
      ) {
        setPopoverOpen(false)
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
          <button
            type="button"
            class="mode-pill"
            classList={{ active: props.viewMode === 'trend' || props.viewMode === 'auction' }}
            onClick={() => {
              setPopoverOpen(false)
              props.onToggleView!('trend')
            }}
            title="全天分时图 (含早盘与尾盘集合竞价)"
          >
            分时
          </button>

          <div class="split-pill-container">
            <button
              type="button"
              class="mode-pill kline-main-pill"
              classList={{ active: props.viewMode === 'kline' }}
              onClick={() => {
                setPopoverOpen(false)
                props.onToggleView!('kline')
              }}
              title={`${currentPeriodLabel()}线及均线系统`}
            >
              {currentPeriodLabel()}
            </button>
            <button
              ref={arrowBtnRef}
              type="button"
              class="mode-pill kline-arrow-pill"
              classList={{ active: popoverOpen() || props.viewMode === 'kline' }}
              onClick={(e) => {
                e.stopPropagation()
                setPopoverOpen(!popoverOpen())
              }}
              title="选择K线周期 (15分/30分/60分/120分/日K/周K)"
            >
              ▾
            </button>

            {/* 上浮气泡菜单 */}
            <Show when={popoverOpen()}>
              <div ref={popoverRef} class="kline-period-popover" onClick={(e) => e.stopPropagation()}>
                <For each={KLINE_PERIODS}>
                  {(p) => (
                    <button
                      type="button"
                      class="period-item"
                      classList={{ active: currentPeriod() === p.id }}
                      onClick={() => {
                        props.onSelectPeriod?.(p.id)
                        props.onToggleView?.('kline')
                        setPopoverOpen(false)
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
