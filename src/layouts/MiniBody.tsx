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
import { FiveDayCanvas } from '../components/FiveDayCanvas'
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
  type DayTrend,
  type KLineBar,
  type KLineData,
  type KlinePeriod,
  type MultiDayTrend,
  type Quote,
  type Snapshot,
  type TrendPoint,
  type WatchItem,
} from '../types'
import { fetchHistoricalDayTrend } from '../tauri'
import { createMiniDerived } from './useMiniDerived'

export type MiniMode = 'trend' | 'five_day' | 'kline' | 'auction'

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
  quote: Accessor<Quote>; item: Accessor<WatchItem | undefined>; snapshot: Accessor<Snapshot>
  activeMode: Accessor<MiniMode>; isIndex: Accessor<boolean>; kline: Accessor<KLineData | undefined>
  indicatorParams: Accessor<MiniIndicatorParams>; subchartMode: Accessor<'vol' | 'macd'>
  onToggleSubchart: () => void; onSelectMode: (mode: MiniMode) => void
  klinePeriod?: Accessor<KlinePeriod>; onSelectPeriod?: (period: KlinePeriod) => void
  multiDayTrend?: Accessor<MultiDayTrend | undefined>; historyDrillDay?: Accessor<DayTrend | null>
  drillOrigin?: Accessor<'five_day' | 'kline'>; hasPrevHistoryDay?: Accessor<boolean>; hasNextHistoryDay?: Accessor<boolean>
  drillableDates?: Accessor<string[]>
  onPrevHistoryDay?: () => void; onNextHistoryDay?: () => void
  onSelectDay?: (day: DayTrend, origin?: 'five_day' | 'kline') => void; onExitHistoryDrill?: () => void
  hover: MiniHoverState
}

export function MiniBody(props: MiniBodyProps) {
  const q = props.quote, item = props.item, s = props.snapshot, activeMode = props.activeMode
  const isIndex = props.isIndex, kline = props.kline, indicatorParams = props.indicatorParams
  const subchartMode = props.subchartMode, toggleSubchartMode = props.onToggleSubchart, setManualMode = props.onSelectMode
  const { point: hoveredPoint, setPoint: setHoveredPoint, pointExtra: hoveredPointExtra, setPointExtra: setHoveredPointExtra, auctionPoint: hoveredAuctionPoint, kbar: hoveredKBar, setKbar: setHoveredKBar, kbarExtra: hoveredKExtra, setKbarExtra: setHoveredKExtra } = props.hover

  const { cost, shares, pnl, clearedPnl, trend, auction, stats, activePrice, activePct, hoverTime, hoverExtra } =
    createMiniDerived({
      quote: q, item, snapshot: s, activeMode, subchartMode, historyDrillDay: props.historyDrillDay,
      hoveredPoint, hoveredPointExtra, hoveredAuctionPoint, hoveredKBar, hoveredKExtra,
    })

  const isAuctionSession = () => ['CallAuctionCancelable', 'CallAuctionLocked', 'PreTrade'].includes(s().status?.session ?? '')
  const currentTrades = () => (!s().config.enablePortfolio || isIndex()) ? [] : (s().trades ?? []).filter((t) => t.code === q().code)
  const showOrderBook = () => !!(s().config.enablePortfolio && !isIndex() && activeMode() !== 'kline' && activeMode() !== 'five_day' && !props.historyDrillDay?.())

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
          <Show
            when={props.historyDrillDay?.()}
            fallback={
              <>
                <Show when={activeMode() === 'kline'}>
                  <KLineBadge kline={kline()} quote={q()} snapshot={s()} />
                </Show>
                <Show when={activeMode() !== 'kline' && isIndex()}>
                  <IndexBadge quote={q()} overview={s().marketOverview} signal={s().trendSignals?.[q().code]} />
                </Show>
                <Show when={activeMode() !== 'kline' && !isIndex()}>
                  <Show when={hoveredPointExtra()?.auctionPoint != null || isAuctionSession()} fallback={
                    <Show when={s().config.trendEngine}>
                      <StockBadge signal={s().trendSignals?.[q().code]} quote={q()} snapshot={s()} />
                    </Show>
                  }>
                    <AuctionBadge auction={auction()} quote={q()} />
                  </Show>
                  <DragonTigerBadge code={q().code} onClick={() => { void emit('open-dragon-tiger-drawer', { code: q().code }) }} />
                </Show>
              </>
            }
          >
            {(drillDay) => {
              const dateStr = () => {
                const d = drillDay().date
                return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d
              }
              return (
                <div class="history-drill-navigator" title="支持鼠标滚轮切换前后日，侧键返回">
                  <button type="button" class="history-drill-arrow" onClick={() => props.onPrevHistoryDay?.()} disabled={!props.hasPrevHistoryDay?.()} title="前一交易日">◀</button>
                  <span class="history-drill-date">📅 {dateStr()}</span>
                  <button type="button" class="history-drill-arrow" onClick={() => props.onNextHistoryDay?.()} disabled={!props.hasNextHistoryDay?.()} title="后一交易日">▶</button>
                  <button type="button" class="history-drill-return" onClick={() => props.onExitHistoryDrill?.()} title={`返回${props.drillOrigin?.() === 'kline' ? '日K' : '5日分时'}`}>
                    ✕ 返回{props.drillOrigin?.() === 'kline' ? 'K线' : '5日'}
                  </button>
                </div>
              )
            }}
          </Show>
        }
        hoverTime={hoverTime()}
        hoverExtra={hoverExtra()}
        extraInfo={
          <div class="mini-pnl-group">
            <Show when={cost() != null}>
              {(_) => {
                const c = cost()!
                const pct = profitPct(q().price, c)
                return pct !== null ? (
                  <span class={`profit-badge ${trendClass(pct)}`}>浮盈 {fmtPct(pct)}</span>
                ) : (
                  <span class="profit-badge flat" title="保本价/摊薄成本">成本 ¥{c.toFixed(2)}</span>
                )
              }}
            </Show>
            <Show when={pnl() !== null}>
              <span class={`profit-badge ${trendClass(pnl()!)}`}>{fmtMoney(pnl()!)}</span>
            </Show>
            <Show when={clearedPnl() !== null && shares() == null}>
              <span class={`profit-badge ${trendClass(clearedPnl()!)}`}>已结 {fmtMoney(clearedPnl()!)}</span>
            </Show>
            <Show when={s().config.enablePortfolio && !isIndex()}>
              <button
                class="mini-trade-badge-btn"
                title="模拟投资 / 快速买卖"
                onClick={(e) => { e.stopPropagation(); void emit('trigger-open-trade', { code: q().code }) }}
              >
                买卖
              </button>
            </Show>
          </div>
        }
      />

      {/* Unified Chart Canvas & Order Book */}
      <div class="mini-chart-section" classList={{ 'with-order-book': showOrderBook() }}>
        <div class="mini-chart-left">
          <Show
            when={activeMode() === 'kline' && !props.historyDrillDay?.()}
            fallback={
              <Show
                when={activeMode() === 'five_day' && !props.historyDrillDay?.()}
                fallback={
                  <Chart
                    trend={props.historyDrillDay?.() ? { code: q().code, date: props.historyDrillDay()!.date, preClose: props.historyDrillDay()!.preClose, points: props.historyDrillDay()!.points } : trend()}
                    auction={props.historyDrillDay?.() ? undefined : auction()}
                    preClose={props.historyDrillDay?.()?.preClose ?? q().preClose}
                    costPrice={cost()}
                    priceLines={item()?.priceLines ?? []}
                    lastPrice={props.historyDrillDay?.() ? (props.historyDrillDay()!.points.slice(-1)[0]?.price ?? q().price) : q().price}
                    orbHigh={props.historyDrillDay?.() || isAuctionSession() ? undefined : s().trendSignals?.[q().code]?.orbHigh}
                    orbLow={props.historyDrillDay?.() || isAuctionSession() ? undefined : s().trendSignals?.[q().code]?.orbLow}
                    subchartMode={subchartMode()}
                    macdParams={indicatorParams().macd}
                    trades={currentTrades()}
                    onHover={(point, extra) => { setHoveredPoint(point); setHoveredPointExtra(extra ? { ...extra, date: props.historyDrillDay?.()?.date, preClose: props.historyDrillDay?.()?.preClose } : null) }}
                  />
                }
              >
                <Show
                  when={props.multiDayTrend?.()}
                  fallback={<div style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', height: '100%', 'font-size': '11px', color: 'var(--text-muted)' }}>正在加载五日分时…</div>}
                >
                  {(mt) => (
                    <FiveDayCanvas
                      multiTrend={mt()}
                      costPrice={cost()}
                      trades={currentTrades()}
                      onSelectDay={(d) => props.onSelectDay?.(d, 'five_day')}
                      onHover={(info) => {
                        if (!info) { setHoveredPoint(null); setHoveredPointExtra(null) }
                        else {
                          setHoveredPoint({ time: info.timeNum, price: info.price, avgPrice: info.avgPrice, cumVolume: info.volume, cumAmount: info.amount })
                          setHoveredPointExtra({ minVol: info.volume, amount: info.amount, date: info.day.date, preClose: info.day.preClose, tradeGroup: info.matchedTrade })
                        }
                      }}
                    />
                  )}
                </Show>
              </Show>
            }
          >
            <KlineCanvas
              kline={kline()}
              quote={q()}
              costPrice={cost()}
              priceLines={item()?.priceLines ?? []}
              trades={currentTrades()}
              subchartMode={subchartMode()}
              maPeriods={indicatorParams().ma}
              macdParams={indicatorParams().macd}
              period={props.klinePeriod?.()}
              drillableDates={props.drillableDates?.() ?? props.multiDayTrend?.()?.days.map((d) => d.date.replace(/-/g, '').slice(0, 8)) ?? []}
              onHoverBar={(bar, extra) => { setHoveredKBar(bar); setHoveredKExtra(extra ?? null) }}
              onSelectBar={(bar) => {
                if (!bar.date) return
                const bDate = bar.date.replace(/-/g, '').slice(0, 8)
                const target = props.multiDayTrend?.()?.days.find((d) => d.date.replace(/-/g, '').slice(0, 8) === bDate)
                if (target) props.onSelectDay?.(target, 'kline')
                else if (q().code) void fetchHistoricalDayTrend(q().code, bDate).then((d) => d && props.onSelectDay?.(d, 'kline'))
              }}
            />
          </Show>
        </div>

        <Show when={showOrderBook()}>
          <MiniOrderBook
            bids={q().bids} asks={q().asks} preClose={q().preClose} currentPrice={q().price}
            pendingOrders={(s().pendingOrders ?? []).filter((o) => o.code === q().code)}
            onPickPrice={(p) => { void emit('trigger-open-trade', { code: q().code, price: p }) }}
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
