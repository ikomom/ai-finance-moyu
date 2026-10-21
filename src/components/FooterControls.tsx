import { Show } from 'solid-js'
import type { SubchartMode } from '../hooks/useSubchartMode'
import './FooterControls.css'

export type ViewMode = 'trend' | 'kline' | 'auction'

export interface FooterControlsProps {
  subchartMode?: SubchartMode
  onToggleSubchart?: (mode: SubchartMode) => void
  viewMode?: ViewMode
  onToggleView?: (mode: ViewMode) => void
  showSubchart?: boolean
  showAuction?: boolean
}

/**
 * 迷你/看板通用的底栏副图与走势模式切换胶囊控制组 (分时 / 日K).
 */
export function FooterControls(props: FooterControlsProps) {
  const showSubchart = () => props.showSubchart ?? true

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

      {/* 视图形态切换胶囊: 分时 / 日K */}
      <Show when={props.viewMode && props.onToggleView}>
        <div class="mode-pill-group">
          <button
            type="button"
            class="mode-pill"
            classList={{ active: props.viewMode === 'trend' || props.viewMode === 'auction' }}
            onClick={() => props.onToggleView!('trend')}
            title="全天分时图 (含早盘与尾盘集合竞价)"
          >
            分时
          </button>
          <button
            type="button"
            class="mode-pill"
            classList={{ active: props.viewMode === 'kline' }}
            onClick={() => props.onToggleView!('kline')}
            title="日K线及均线系统"
          >
            日K
          </button>
        </div>
      </Show>
    </div>
  )
}
