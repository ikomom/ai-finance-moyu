import { For, Show } from 'solid-js'
import { WatchEditor } from '../WatchEditor'
import { SOURCE_NOTES, useSettings } from './SettingsContext'
import './WatchlistTab.css'

export function WatchlistTab() {
  const {
    form,
    setForm,
    sources,
    updateItem,
    addItem,
    addItemWith,
    removeItem,
    moveItem,
    sortItems,
    addLine,
    updateLine,
    removeLine,
    createGroup,
    renameGroup,
    deleteGroup,
    say,
  } = useSettings()

  return (
    <div class="tab-pane">
      {/* 1. 数据源通道 */}
      <div class="card">
        <div class="card-title-row">
          <h2>数据源通道</h2>
          <span class="card-badge">实时行情</span>
        </div>
        <p class="hint">
          均使用公开行情通道，免登录。切换源后立即重连重新拉取。
        </p>
        <div class="source-pills">
          <For each={sources()}>
            {([value, label]) => (
              <div
                class="source-pill"
                classList={{ active: form.dataSource === value }}
                onClick={() => setForm('dataSource', value)}
              >
                <div class="pill-radio-dot" />
                <div class="pill-content">
                  <span class="pill-title">{label}</span>
                  <span class="pill-desc">{SOURCE_NOTES[value] ?? ''}</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* 2. 行情指标策略默认档位 */}
      <div class="card">
        <div class="card-title-row">
          <h2>行情指标策略默认档位</h2>
          <span class="card-badge">MA均线与MACD</span>
        </div>
        <p class="hint">
          设置分时图与日K线所用的指标响应速度。极速超短适合打板与日内监控，中线波段平滑抗钝化。自选个股可展开「详情」单独覆盖。
        </p>
        <div class="grid-options col-3">
          <div
            class="opt-card"
            classList={{ active: form.indicatorConfig?.preset === 'ultra_short' }}
            onClick={() =>
              setForm('indicatorConfig', {
                preset: 'ultra_short',
                ma: [3, 5, 10],
                macd: [6, 13, 5],
              })
            }
          >
            <div class="opt-head">
              <span class="opt-icon">⚡</span>
              <span class="opt-name">极速超短</span>
              <span class="opt-badge">打板龙头</span>
            </div>
            <p class="opt-desc">MA 3/5/10 · MACD 6/13/5。极度敏锐，适合日内与超短拐点确认</p>
          </div>

          <div
            class="opt-card"
            classList={{ active: (form.indicatorConfig?.preset ?? 'classic') === 'classic' }}
            onClick={() =>
              setForm('indicatorConfig', {
                preset: 'classic',
                ma: [5, 10, 20],
                macd: [12, 26, 9],
              })
            }
          >
            <div class="opt-head">
              <span class="opt-icon">🎯</span>
              <span class="opt-name">经典短线</span>
              <span class="opt-badge">标准默认</span>
            </div>
            <p class="opt-desc">MA 5/10/20 · MACD 12/26/9。兼顾平滑度与过滤假突破，最普遍使用</p>
          </div>

          <div
            class="opt-card"
            classList={{ active: form.indicatorConfig?.preset === 'swing' }}
            onClick={() =>
              setForm('indicatorConfig', {
                preset: 'swing',
                ma: [10, 30, 60],
                macd: [19, 39, 9],
              })
            }
          >
            <div class="opt-head">
              <span class="opt-icon">🌊</span>
              <span class="opt-name">中线波段</span>
              <span class="opt-badge">趋势追踪</span>
            </div>
            <p class="opt-desc">MA 10/30/60 · MACD 19/39/9。大周期均线多头，彻底规避杂音与钝化</p>
          </div>
        </div>

        <div style="margin-top: 10px;">
          <div
            class="opt-card"
            style="padding: 10px 14px;"
            classList={{ active: form.indicatorConfig?.preset === 'custom' }}
            onClick={() => {
              if (form.indicatorConfig?.preset !== 'custom') {
                setForm('indicatorConfig', 'preset', 'custom')
              }
            }}
          >
            <div class="opt-head" style="margin-bottom: 4px;">
              <span class="opt-icon">🛠️</span>
              <span class="opt-name">自定义参数</span>
              <span class="opt-badge">高级定制</span>
            </div>
            <p class="opt-desc">自由定义日K均线周期与 MACD 响应参数</p>

            <Show when={form.indicatorConfig?.preset === 'custom'}>
              <div class="custom-indicator-inputs" style="margin-top: 8px;" onClick={(e) => e.stopPropagation()}>
                <div class="quick-fill-row" style="margin-bottom: 8px;">
                  <span class="quick-fill-label">快捷填入档位：</span>
                  <button
                    type="button"
                    class="quick-fill-chip"
                    onClick={() => {
                      setForm('indicatorConfig', 'ma', [3, 5, 10])
                      setForm('indicatorConfig', 'macd', [6, 13, 5])
                      say('已快捷填入「极速超短」参数', 'ok')
                    }}
                  >
                    ⚡ 极速超短 (3/5/10 · 6/13/5)
                  </button>
                  <button
                    type="button"
                    class="quick-fill-chip"
                    onClick={() => {
                      setForm('indicatorConfig', 'ma', [5, 10, 20])
                      setForm('indicatorConfig', 'macd', [12, 26, 9])
                      say('已快捷填入「经典短线」参数', 'ok')
                    }}
                  >
                    🎯 经典短线 (5/10/20 · 12/26/9)
                  </button>
                  <button
                    type="button"
                    class="quick-fill-chip"
                    onClick={() => {
                      setForm('indicatorConfig', 'ma', [10, 30, 60])
                      setForm('indicatorConfig', 'macd', [19, 39, 9])
                      say('已快捷填入「中线波段」参数', 'ok')
                    }}
                  >
                    🌊 中线波段 (10/30/60 · 19/39/9)
                  </button>
                </div>
                <div class="custom-group">
                  <span class="custom-title">MA 均线周期:</span>
                  <input
                    type="number"
                    min="1"
                    max="250"
                    value={form.indicatorConfig?.ma?.[0] ?? 5}
                    onInput={(e) => {
                      const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 5))
                      setForm('indicatorConfig', 'ma', 0, v)
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="250"
                    value={form.indicatorConfig?.ma?.[1] ?? 10}
                    onInput={(e) => {
                      const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 10))
                      setForm('indicatorConfig', 'ma', 1, v)
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="250"
                    value={form.indicatorConfig?.ma?.[2] ?? 20}
                    onInput={(e) => {
                      const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 20))
                      setForm('indicatorConfig', 'ma', 2, v)
                    }}
                  />
                </div>
                <div class="custom-group">
                  <span class="custom-title">MACD 参数 (快/慢/信号):</span>
                  <input
                    type="number"
                    min="1"
                    max="250"
                    value={form.indicatorConfig?.macd?.[0] ?? 12}
                    onInput={(e) => {
                      const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 12))
                      setForm('indicatorConfig', 'macd', 0, v)
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="250"
                    value={form.indicatorConfig?.macd?.[1] ?? 26}
                    onInput={(e) => {
                      const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 26))
                      setForm('indicatorConfig', 'macd', 1, v)
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="250"
                    value={form.indicatorConfig?.macd?.[2] ?? 9}
                    onInput={(e) => {
                      const v = Math.max(1, Math.min(250, Number(e.currentTarget.value) || 9))
                      setForm('indicatorConfig', 'macd', 2, v)
                    }}
                  />
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* 4. 自选股票池与仓位 */}
      <div class="card">
        <div class="card-title-row">
          <h2>自选股票池与仓位</h2>
          <span class="card-badge">共 {form.watchlist.length} 只标的</span>
        </div>
        <p class="hint">
          在上方搜索框直接输入股票中文、拼音或代码加入自选；在下方输入框直接输入中文也会自动智能解析为标准代码。
        </p>
        <WatchEditor
          items={form.watchlist}
          groups={form.groups}
          update={updateItem}
          add={addItem}
          addWithItem={addItemWith}
          remove={removeItem}
          move={moveItem}
          sort={sortItems}
          addLine={addLine}
          updateLine={updateLine}
          removeLine={removeLine}
          onCreateGroup={createGroup}
          onRenameGroup={renameGroup}
          onDeleteGroup={deleteGroup}
          onToast={(text, kind) => say(text, kind)}
        />
      </div>
    </div>
  )
}
