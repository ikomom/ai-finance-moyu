import { For, Show } from 'solid-js'
import './Market.css'

import { Grip } from '../components/Grip'
import { StatusLine } from '../components/StatusLine'
import { snapshot } from '../store'
import { fmtPct, fmtPrice, fmtTurnover, trendClass } from '../types'

/**
 * Layout 4 — 大盘全景看板 (A股市场温度与板块情绪).
 */
export function Market(props: { flash: boolean }) {
  const s = () => snapshot()!
  const overview = () => s()?.marketOverview

  const up = () => overview()?.upCount ?? 0
  const down = () => overview()?.downCount ?? 0
  const flat = () => overview()?.flatCount ?? 0
  const total = () => {
    const sum = up() + down() + flat()
    return sum > 0 ? sum : 1
  }

  const upPct = () => Math.round((up() / total()) * 100)
  const downPct = () => Math.round((down() / total()) * 100)

  return (
    <div
      class="card layout-market"
      classList={{ flash: props.flash }}
      data-tauri-drag-region
    >
      {/* 顶部标题与更新指示 */}
      <div class="market-header" data-tauri-drag-region>
        <div class="market-title">
          <span class="icon">🧭</span>
          <span class="title-text">大盘全景</span>
        </div>
        <div class="market-time">
          <Show when={overview()?.updatedAt}>
            {(t) => <span class="update-badge">{t()}</span>}
          </Show>
        </div>
      </div>

      <Show
        when={overview()}
        fallback={
          <div class="market-loading">
            <span class="loading-spinner">⌛</span>
            <span>正在拉取全市场数据…</span>
          </div>
        }
      >
        {(data) => (
          <div class="market-body">
            {/* 三大指数卡片 */}
            <div class="index-grid">
              <For each={data().indices}>
                {(idx) => (
                  <div class="index-card">
                    <div class="idx-name">{idx.name}</div>
                    <div
                      class={`idx-price ${idx.price > 0 ? trendClass(idx.changePct) : 'flat'}`}
                    >
                      {idx.price > 0 ? fmtPrice(idx.price, 2) : '--'}
                    </div>
                    <div
                      class={`idx-change ${idx.price > 0 ? trendClass(idx.changePct) : 'flat'}`}
                    >
                      <span>
                        {idx.change >= 0 ? '+' : ''}
                        {idx.change.toFixed(2)}
                      </span>
                      <span>{idx.price > 0 ? fmtPct(idx.changePct) : '--'}</span>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* 全市场多空温度计 */}
            <div class="breadth-section">
              <div class="breadth-counts">
                <span class="count-tag up">
                  <b class="label">涨</b> {up()}
                </span>
                <span class="count-tag flat">
                  <b class="label">平</b> {flat()}
                </span>
                <span class="count-tag down">
                  <b class="label">跌</b> {down()}
                </span>
              </div>
              <div class="breadth-bar-container">
                <div
                  class="breadth-bar-segment up-bar"
                  style={{ width: `${upPct()}%` }}
                  title={`上涨占比 ${upPct()}%`}
                />
                <div
                  class="breadth-bar-segment down-bar"
                  style={{ width: `${downPct()}%` }}
                  title={`下跌占比 ${downPct()}%`}
                />
              </div>
            </div>

            {/* 两市成交总额 & 较昨日环比增减 */}
            <div class="macro-stats-row">
              <div class="macro-stat-item">
                <span class="stat-label">两市成交</span>
                <span class="stat-value">{fmtTurnover(data().totalTurnover)}</span>
              </div>
              <div class="macro-stat-item">
                <span class="stat-label">较昨日</span>
                <Show
                  when={typeof data().turnoverChangePct === 'number'}
                  fallback={<span class="stat-value flat">--</span>}
                >
                  {(() => {
                    const pctVal = data().turnoverChangePct!
                    const isUp = pctVal > 0
                    const isDown = pctVal < 0
                    const tag = isUp ? '放量' : isDown ? '缩量' : '平'
                    const sign = isUp ? '+' : ''
                    const amtStr =
                      data().turnoverChangeAmount != null
                        ? ` (${isUp ? '+' : '-'}${fmtTurnover(Math.abs(data().turnoverChangeAmount!))})`
                        : ''
                    return (
                      <span
                        class={`stat-value ${trendClass(pctVal)}`}
                        title={`${tag} ${sign}${pctVal.toFixed(2)}%${amtStr}`}
                      >
                        {tag} {sign}
                        {pctVal.toFixed(1)}%
                      </span>
                    )
                  })()}
                </Show>
              </div>
            </div>

            {/* 热门领涨板块 */}
            <div class="sectors-section">
              <div class="sectors-title">热门领涨行业</div>
              <div class="sectors-grid">
                <For each={data().topSectors.slice(0, 4)}>
                  {(sec) => (
                    <div class="sector-badge">
                      <div class="sec-top">
                        <span class="sec-name">{sec.name}</span>
                        <span class={`sec-pct ${trendClass(sec.changePct)}`}>
                          {fmtPct(sec.changePct)}
                        </span>
                      </div>
                      <Show when={sec.leadStockName}>
                        <div class="sec-lead">
                          <span class="lead-label">领涨</span>
                          <span class="lead-stock">{sec.leadStockName}</span>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>
        )}
      </Show>

      <StatusLine status={s().status} />
      <Grip />
    </div>
  )
}
