//! Detail card for the Global layout: header, chart switch and footer.
//!
//! Extracted from `Global.tsx` so that file keeps only state/loading wiring
//! (AGENTS.md §11). All closures arrive as props, so this component owns no
//! layout state of its own.

import { Show, type Accessor } from 'solid-js'

import { Chart } from '../components/Chart'
import { FooterControls } from '../components/FooterControls'
import { GlobalStatusBadge } from '../components/GlobalStatusBadge'
import { KlineCanvas } from '../components/KlineCanvas'
import { StatusLine } from '../components/StatusLine'
import { StockHeader } from '../components/StockHeader'
import { getGlobalMarketStatus } from '../utils/globalMarket'
import type { KLineBar, KLineData, MarketIndex, Quote, Snapshot, Trend, TrendPoint } from '../types'

export interface GlobalHover {
  point: Accessor<TrendPoint | null>
  setPoint: Accessor<unknown> | ((v: TrendPoint | null) => void)
  pointExtra: Accessor<{ minVol: number; dif?: number; dea?: number; macd?: number } | null>
  setPointExtra: (v: { minVol: number; dif?: number; dea?: number; macd?: number } | null) => void
  kbar: Accessor<KLineBar | null>
  setKbar: (v: KLineBar | null) => void
  kbarExtra: Accessor<{
    ma5?: number | null
    ma10?: number | null
    ma20?: number | null
    dif?: number | null
    dea?: number | null
    macd?: number | null
    chgPct?: number | null
  } | null>
  setKbarExtra: (v: {
    ma5?: number | null
    ma10?: number | null
    ma20?: number | null
    dif?: number | null
    dea?: number | null
    macd?: number | null
    chgPct?: number | null
  } | null) => void
}

export interface GlobalDetailProps {
  idx: Accessor<MarketIndex>
  quote: Accessor<Quote | null>
  snapshot: Accessor<Snapshot>
  activePrice: Accessor<number>
  activePct: Accessor<number>
  stats: Accessor<{ high: number; low: number }>
  hoverTime: Accessor<string | null>
  hoverExtra: Accessor<string | null>
  activeMode: Accessor<'trend' | 'kline'>
  trend: Accessor<Trend | undefined>
  kline: Accessor<KLineData | undefined>
  preClose: Accessor<number>
  loading: Accessor<boolean>
  subchartMode: Accessor<'vol' | 'macd'>
  onReloadTrend: () => void
  onReloadKline: () => void
  onSelectMode: (mode: 'trend' | 'kline') => void
  onToggleSubchart: () => void
  onHoverPoint: (p: TrendPoint | null, extra?: { minVol: number; dif?: number; dea?: number; macd?: number } | null) => void
  onHoverBar: (bar: KLineBar | null, extra?: GlobalHover['kbarExtra'] extends Accessor<infer T> ? T : never) => void
}

export function GlobalDetail(props: GlobalDetailProps) {
  const idx = props.idx
  const activePrice = props.activePrice
  const activePct = props.activePct
  const stats = props.stats
  const hoverTime = props.hoverTime
  const hoverExtra = props.hoverExtra
  const activeMode = props.activeMode
  const trend = props.trend
  const kline = props.kline
  const preClose = props.preClose
  const loading = () => props.loading()
  const subchartMode = props.subchartMode
  const st = () => getGlobalMarketStatus(idx().code)

  return (
            <>
              {/* 指数名称、代码、交易时段状态微标、日内高低、大字价格、作息提示 (复用 StockHeader) */}
              <StockHeader
                name={idx().name}
                code={idx().code}
                price={idx().price}
                changePct={idx().changePct}
                activePrice={activePrice()}
                activePct={activePct()}
                high={stats().high}
                low={stats().low}
                badge={<GlobalStatusBadge status={st()} />}
                hoverTime={hoverTime()}
                hoverExtra={hoverExtra()}
                extraInfo={
                  <span class="hover-time-tag" style={{ opacity: 0.65, 'margin-left': 'auto' }}>
                    {st().hoursText}
                  </span>
                }
              />

              {/* 图表展示区：分时 / 日K */}
              <Show
                when={activeMode() === 'kline'}
                fallback={
                  /* 分时走势图 */
                  <Show
                    when={!loading() && trend()}
                    fallback={
                      <div class="chart-wrap kline-loading-box">
                        <Show
                          when={loading()}
                          fallback={
                            <>
                              <span>⚠️ 暂无分时数据或未在交易时段</span>
                              <button
                                type="button"
                                class="global-retry-btn"
                                onClick={() => props.onReloadTrend()}
                              >
                                重试
                              </button>
                            </>
                          }
                        >
                          <span class="loading-spinner">⌛</span>
                          <span>加载分时数据中…</span>
                        </Show>
                      </div>
                    }
                  >
                    <Chart
                      trend={trend()}
                      preClose={preClose()}
                      lastPrice={idx().price}
                      subchartMode={subchartMode()}
                      compact={false}
                      isGlobal={true}
                      onHover={(point, extra) => props.onHoverPoint(point, extra ?? null)}
                    />
                  </Show>
                }
              >
                {/* 日K走势图 */}
                <Show
                  when={!loading() && kline()}
                  fallback={
                    <div class="chart-wrap kline-loading-box">
                      <Show
                        when={loading()}
                        fallback={
                          <>
                            <span>⚠️ 暂无日K数据</span>
                            <button
                              type="button"
                              class="global-retry-btn"
                              onClick={() => props.onReloadKline()}
                            >
                              重试
                            </button>
                          </>
                        }
                      >
                        <span class="loading-spinner">⌛</span>
                        <span>加载日K数据中…</span>
                      </Show>
                    </div>
                  }
                >
                  <KlineCanvas
                    kline={kline()}
                    quote={props.quote()}
                    subchartMode={subchartMode()}
                    onHoverBar={(bar, extra) => props.onHoverBar(bar, extra)}
                  />
                </Show>
              </Show>

              {/* 底部状态条与副图/走势模式切换胶囊 (复用 FooterControls) */}
              <div class="mini-footer">
                <StatusLine status={props.snapshot().status} />
                <FooterControls
                  subchartMode={subchartMode()}
                  onToggleSubchart={() => props.onToggleSubchart()}
                  viewMode={activeMode()}
                  onToggleView={(m) => {
                    if (m === 'trend' || m === 'kline') props.onSelectMode(m)
                  }}
                  showSubchart={true}
                  showAuction={false}
                />
              </div>
            </>
  )
}
