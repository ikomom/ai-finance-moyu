//! The Mini layout card body: header, chart switch and footer.
//!
//! Extracted from `Mini.tsx` so that file keeps only state/effects (AGENTS.md
//! §11 colocation + 300-line budget). Every closure the body needs is passed in
//! explicitly, so this component has no hidden dependency on layout state.

import { Show, type Accessor, type Setter } from 'solid-js'
import { emit } from '@tauri-apps/api/event'

import { AuctionBadge } from '../components/AuctionBadge'
import { Chart, type HoverExtra } from '../components/Chart'
import { DragonTigerBadge } from '../components/dragon_tiger/DragonTigerBadge'
import { FooterControls } from '../components/FooterControls'
import { IndexBadge } from '../components/IndexBadge'
import { KLineBadge } from '../components/KLineBadge'
import { KlineCanvas } from '../components/KlineCanvas'
import { MiniOrderBook } from '../components/portfolio/MiniOrderBook'
import { StatusLine } from '../components/StatusLine'
import { StockHeader } from '../components/StockHeader'
import { StockBadge } from '../components/StockBadge'
import {
  fmtMoney,
  fmtPct,
  profitPct,
  trendClass,
  type AuctionPoint,
  type KLineBar,
  type KLineData,
  type KlinePeriod,
  type Quote,
  type Snapshot,
  type TrendPoint,
  type WatchItem,
} from '../types'
import { createMiniDerived } from './useMiniDerived'

export type MiniMode = 'trend' | 'kline' | 'auction'

export interface MiniIndicatorParams {
  ma: [number, number, number]
  macd: [number, number, number]
}

export type KbarExtra = {
  ma5?: number | null; ma10?: number | null; ma20?: number | null;
  dif?: number | null; dea?: number | null; macd?: number | null; chgPct?: number | null;
} | null

export interface MiniHoverState {
  point: Accessor<TrendPoint | null>
  setPoint: Setter<TrendPoint | null>
  pointExtra: Accessor<HoverExtra | null>
  setPointExtra: Setter<HoverExtra | null>
  auctionPoint: Accessor<AuctionPoint | null>
  setAuctionPoint: Setter<AuctionPoint | null>
  kbar: Accessor<KLineBar | null>
  setKbar: Setter<KLineBar | null>
  kbarExtra: Accessor<KbarExtra>
  setKbarExtra: Setter<KbarExtra>
}

export interface MiniBodyProps {
  quote: Accessor<Quote>
  item: Accessor<WatchItem | undefined>
  snapshot: Accessor<Snapshot>
  activeMode: Accessor<MiniMode>
  isIndex: Accessor<boolean>
  kline: Accessor<KLineData | undefined>
  indicatorParams: Accessor<MiniIndicatorParams>
  subchartMode: Accessor<'vol' | 'macd'>
  onToggleSubchart: () => void
  onSelectMode: (mode: MiniMode) => void
  klinePeriod?: Accessor<KlinePeriod>
  onSelectPeriod?: (period: KlinePeriod) => void
  hover: MiniHoverState
}

export function MiniBody(props: MiniBodyProps) {
  const q = props.quote
  const item = props.item
  const s = props.snapshot
  const activeMode = props.activeMode
  const isIndex = props.isIndex
  const kline = props.kline
  const indicatorParams = props.indicatorParams
  const subchartMode = props.subchartMode
  const toggleSubchartMode = props.onToggleSubchart
  const setManualMode = props.onSelectMode
  const hoveredPoint = props.hover.point
  const setHoveredPoint = props.hover.setPoint
  const hoveredPointExtra = props.hover.pointExtra
  const setHoveredPointExtra = props.hover.setPointExtra
  const hoveredAuctionPoint = props.hover.auctionPoint
  const hoveredKBar = props.hover.kbar
  const setHoveredKBar = props.hover.setKbar
  const hoveredKExtra = props.hover.kbarExtra
  const setHoveredKExtra = props.hover.setKbarExtra

  const { cost, pnl, trend, auction, stats, activePrice, activePct, hoverTime, hoverExtra } =
    createMiniDerived({
      quote: q,
      item,
      snapshot: s,
      activeMode,
      subchartMode,
      hoveredPoint,
      hoveredPointExtra,
      hoveredAuctionPoint,
      hoveredKBar,
      hoveredKExtra,
    })

  const isAuctionSession = () =>
    ['CallAuctionCancelable', 'CallAuctionLocked', 'PreTrade'].includes(s().status?.session ?? '')

  return (
    <>
      {/* Unified Stock Header */}
      <StockHeader
        name={q().name}
        code={q().code}
        price={q().price}
        changePct={q().changePct}
        activePrice={activePrice()}
        activePct={activePct()}
        high={stats().high}
        low={stats().low}
        badge={
          <>
            <Show
              when={activeMode() === 'kline'}
              fallback={
                <Show
                  when={isIndex()}
                  fallback={
                    <Show
                      when={hoveredPointExtra()?.auctionPoint != null || isAuctionSession()}
                      fallback={
                        <Show when={s().config.trendEngine}>
                          <StockBadge signal={s().trendSignals?.[q().code]} quote={q()} snapshot={s()} />
                        </Show>
                      }
                    >
                      <AuctionBadge auction={auction()} quote={q()} />
                    </Show>
                  }
                >
                  <IndexBadge
                    quote={q()}
                    overview={s().marketOverview}
                    signal={s().trendSignals?.[q().code]}
                  />
                </Show>
              }
            >
              <KLineBadge kline={kline()} quote={q()} snapshot={s()} />
            </Show>
            <Show when={!isIndex()}>
              <DragonTigerBadge
                code={q().code}
                onClick={() => {
                  void emit('open-dragon-tiger-drawer', { code: q().code })
                }}
              />
            </Show>
          </>
        }
        hoverTime={hoverTime()}
        hoverExtra={hoverExtra()}
        extraInfo={
          <div class="mini-pnl-group">
            <Show when={cost()}>
              {(c) => {
                const pct = profitPct(q().price, c())
                return pct !== null ? (
                  <span class={`profit-badge ${trendClass(pct)}`}>
                    浮盈 {fmtPct(pct)}
                  </span>
                ) : null
              }}
            </Show>
            <Show when={pnl() !== null}>
              <span class={`profit-badge ${trendClass(pnl()!)}`}>
                {fmtMoney(pnl()!)}
              </span>
            </Show>
            <Show when={s().config.enablePortfolio && !isIndex()}>
              <button
                class="mini-trade-badge-btn"
                title="模拟投资 / 快速买卖"
                onClick={(e) => {
                  e.stopPropagation()
                  void emit('trigger-open-trade', { code: q().code })
                }}
              >
                买卖
              </button>
            </Show>
          </div>
        }
      />

      {/* Unified Chart Canvas & Order Book */}
      <div class="mini-chart-section" classList={{ 'with-order-book': !!(s().config.enablePortfolio && !isIndex() && activeMode() !== 'kline') }}>
        <div class="mini-chart-left">
          <Show
            when={activeMode() === 'kline'}
            fallback={
              <Chart
                trend={trend()}
                auction={auction()}
                preClose={q().preClose}
                costPrice={cost()}
                priceLines={item()?.priceLines ?? []}
                lastPrice={q().price}
                orbHigh={s().trendSignals?.[q().code]?.orbHigh}
                orbLow={s().trendSignals?.[q().code]?.orbLow}
                subchartMode={subchartMode()}
                macdParams={indicatorParams().macd}
                onHover={(point, extra) => {
                  setHoveredPoint(point)
                  setHoveredPointExtra(extra ?? null)
                }}
              />
            }
          >
            <KlineCanvas
              kline={kline()}
              quote={q()}
              costPrice={cost()}
              priceLines={item()?.priceLines ?? []}
              subchartMode={subchartMode()}
              maPeriods={indicatorParams().ma}
              macdParams={indicatorParams().macd}
              onHoverBar={(bar, extra) => {
                setHoveredKBar(bar)
                setHoveredKExtra(extra ?? null)
              }}
            />
          </Show>
        </div>

        <Show when={s().config.enablePortfolio && !isIndex() && activeMode() !== 'kline'}>
          <MiniOrderBook
            bids={q().bids}
            asks={q().asks}
            preClose={q().preClose}
            currentPrice={q().price}
            pendingOrders={(s().pendingOrders ?? []).filter((o) => o.code === q().code)}
            onPickPrice={(p) => {
              void emit('trigger-open-trade', { code: q().code, price: p })
            }}
          />
        </Show>
      </div>

      {/* Unified Footer */}
      <div class="mini-footer">
        <StatusLine status={s().status} />
        <FooterControls
          subchartMode={subchartMode()}
          onToggleSubchart={toggleSubchartMode}
          viewMode={activeMode()}
          onToggleView={(m) => setManualMode(m)}
          showSubchart={true}
          klinePeriod={props.klinePeriod?.()}
          onSelectPeriod={props.onSelectPeriod}
        />
      </div>
    </>
  )
}
