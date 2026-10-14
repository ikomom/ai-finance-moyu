import { createSignal, For, onMount, Show } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

import { WatchEditor } from './components/WatchEditor'
import type { Config, DataSource, Layout, PriceLine, Snapshot, VisibilityMode, WatchItem } from './types'

type TabKey = 'watchlist' | 'appearance' | 'alerts' | 'system'

const [form, setForm] = createStore<Config>({
  watchlist: [],
  layout: 'mini',
  opacity: 0.92,
  dataSource: 'tencent',
  visibilityMode: 'always',
  alertPct: 3,
  pollQuotesMs: 3000,
  pollTrendMs: 30000,
  notifications: true,
  autostart: false,
  trendEngine: true,
  anomalyAlerts: {
    rapidChange: true,
    intradayExtremes: true,
    volumeBurst: true,
    limitBoard: true,
  },
  hotkeys: {
    toggle: 'ctrl+alt+h',
    layoutBar: 'ctrl+alt+1',
    layoutMini: 'ctrl+alt+2',
    layoutList: 'ctrl+alt+3',
    layoutMarket: 'ctrl+alt+4',
  },
  indicatorConfig: {
    preset: 'classic',
    ma: [5, 10, 20],
    macd: [12, 26, 9],
  },
  window: { x: 0, y: 0, width: 320, height: 170 },
})

const [sources, setSources] = createSignal<Array<[DataSource, string]>>([])
const [ready, setReady] = createSignal(false)
const [activeTab, setActiveTab] = createSignal<TabKey>('watchlist')
const [msg, setMsg] = createSignal<{ text: string; kind: '' | 'ok' | 'bad' }>({
  text: '',
  kind: '',
})

const TABS: Array<{ id: TabKey; label: string; icon: string; desc: string }> = [
  { id: 'watchlist', label: '自选标的', icon: '📊', desc: '数据源与股票池' },
  { id: 'appearance', label: '外观悬浮', icon: '🎨', desc: '形态与吸附策略' },
  { id: 'alerts', label: '提醒刷新', icon: '🔔', desc: '频率与到价告警' },
  { id: 'system', label: '按键系统', icon: '⌨️', desc: '老板键与自启动' },
]

const SOURCE_NOTES: Record<string, string> = {
  tencent: '批量高效报价，分时接口直接提供精准累计量额（推荐）',
  sina: '老牌行情源，需带 Referer 校验，分时每分钟量额由本地累加',
}

const LAYOUTS: Array<{ value: Layout; name: string; badge: string; desc: string; icon: string }> = [
  {
    value: 'bar',
    name: '数字条',
    badge: '极简摸鱼',
    desc: '32px 单行横向药丸条，滚轮横向滑动，隐蔽度极高',
    icon: '💊',
  },
  {
    value: 'mini',
    name: '迷你图',
    badge: '日内走势',
    desc: '独立卡片分时曲线 + 标的药丸切歌切换 + 十字光标',
    icon: '📈',
  },
  {
    value: 'list',
    name: '列表看板',
    badge: '全量概览',
    desc: '高密度金融数据 + 全标的实时走势 Sparkline + 盈亏汇总',
    icon: '📋',
  },
  {
    value: 'market',
    name: '大盘全景',
    badge: '市场温度',
    desc: '三大指数 + 涨跌分布多空温度计 + 两市成交量 + 领涨板块',
    icon: '🧭',
  },
]

const VISIBILITIES: Array<{ value: VisibilityMode; name: string; desc: string; icon: string }> = [
  {
    value: 'always',
    name: '常驻显示',
    desc: '始终完整悬浮在屏幕最上层，不触发边缘自动折叠收拢',
    icon: '📌',
  },
  {
    value: 'hover',
    name: '鼠标悬停展开',
    desc: '拖拽贴紧左/右/顶屏幕边缘时折叠为 8px 把手，鼠标滑过自动滑出展开',
    icon: '👆',
  },
  {
    value: 'dblclick',
    name: '双击把手展开',
    desc: '贴边折叠为小把手，双击展开防误触，移出无操作 2s 自动收拢归位',
    icon: '🖱️',
  },
  {
    value: 'hotkey',
    name: '仅快捷键控制',
    desc: '不触发贴边收拢，完全由全局老板键 (Ctrl+Alt+H) 显隐避险',
    icon: '⌨️',
  },
]

/** Hotkey fields, in display order. */
const HOTKEY_FIELDS = [
  ['toggle', '显示 / 隐藏（老板键）', '任意时刻一键隐藏/唤起主挂件'],
  ['layoutBar', '快捷切换到数字条', '快速切到 32px 极简单行胶囊'],
  ['layoutMini', '快捷切换到迷你图', '快速查看当前选中的标的分时大图'],
  ['layoutList', '快捷切换到列表', '快速展开全量自选列表与走势 Sparkline'],
  ['layoutMarket', '快捷切换到大盘全景', '一键查看三大指数、涨跌家数与热门板块'],
] as const

export function Settings() {
  onMount(async () => {
    try {
      const snapshot = await invoke<Snapshot>('get_snapshot')
      setSources(await invoke<Array<[DataSource, string]>>('data_sources'))
      setForm({
        ...snapshot.config,
        hotkeys: {
          ...snapshot.config.hotkeys,
          layoutMarket: snapshot.config.hotkeys.layoutMarket ?? 'ctrl+alt+4',
        },
        anomalyAlerts: snapshot.config.anomalyAlerts ?? {
          rapidChange: true,
          intradayExtremes: true,
          volumeBurst: true,
          limitBoard: true,
        },
        iwencaiApiKey: snapshot.config.iwencaiApiKey ?? '',
        indicatorConfig: snapshot.config.indicatorConfig ?? {
          preset: 'classic',
          ma: [5, 10, 20],
          macd: [12, 26, 9],
        },
        watchlist: snapshot.config.watchlist.map((w) => ({
          ...w,
          name: w.name || snapshot.quotes.find((q) => q.code.toLowerCase() === w.code.toLowerCase())?.name || null,
          priceLines: w.priceLines ?? [],
        })),
      })
      setReady(true)
    } catch (e) {
      setMsg({ text: `读取配置失败：${e}`, kind: 'bad' })
    }
  })

  const updateItem = (i: number, patch: Partial<WatchItem>) => setForm('watchlist', i, patch)
  const addItem = () => setForm('watchlist', (list) => [...list, { code: '', priceLines: [] }])
  const addItemWith = (item: WatchItem) => setForm('watchlist', (list) => [...list, item])
  const removeItem = (i: number) => setForm('watchlist', (list) => list.filter((_, n) => n !== i))

  const moveItem = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= form.watchlist.length || to >= form.watchlist.length || from === to) return
    setForm('watchlist', (list) => {
      const next = [...list]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const sortItems = (criterion: 'code-asc' | 'code-desc' | 'name' | 'holding' | 'reverse') => {
    setForm('watchlist', (list) => {
      const next = [...list]
      if (criterion === 'code-asc') {
        next.sort((a, b) => a.code.localeCompare(b.code))
      } else if (criterion === 'code-desc') {
        next.sort((a, b) => b.code.localeCompare(a.code))
      } else if (criterion === 'name') {
        next.sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, 'zh-Hans-CN'))
      } else if (criterion === 'holding') {
        next.sort((a, b) => ((b.shares || 0) > 0 ? 1 : 0) - ((a.shares || 0) > 0 ? 1 : 0))
      } else if (criterion === 'reverse') {
        next.reverse()
      }
      return next
    })
    say('已重新排序', 'ok')
    window.setTimeout(() => say(''), 1500)
  }

  const addLine = (i: number) =>
    setForm('watchlist', i, 'priceLines', (lines) => [
      ...(lines ?? []),
      { price: 0, direction: 'above' as const },
    ])

  const updateLine = (i: number, li: number, patch: Partial<PriceLine>) =>
    setForm('watchlist', i, 'priceLines', li, patch)

  const removeLine = (i: number, li: number) =>
    setForm('watchlist', i, 'priceLines', (lines) => (lines ?? []).filter((_, n) => n !== li))

  const say = (text: string, kind: '' | 'ok' | 'bad' = '') => setMsg({ text, kind })

  const save = async () => {
    if (form.watchlist.length === 0) {
      say('至少保留一只自选股', 'bad')
      return
    }
    say('保存中…')
    try {
      await invoke('save_config', { cfg: unwrap(form) })
    } catch (e) {
      say(`保存失败：${e}`, 'bad')
      return
    }
    say('已保存并刷新', 'ok')
    window.setTimeout(() => say(''), 2500)
  }

  const sizesText = () => {
    const s = form.layoutSizes ?? {}
    return (['bar', 'mini', 'list'] as const)
      .map((k) => {
        const v = s[k]
        return `${k === 'bar' ? '数字条' : k === 'mini' ? '迷你图' : '列表'} ${v ? `${Math.round(v[0])}×${Math.round(v[1])}` : '自动'}`
      })
      .join(' · ')
  }

  return (
    <div id="settings-root">
      <Show when={ready()} fallback={<div class="loading-state">{msg().text || '正在载入参数配置…'}</div>}>
        <div id="settings-layout">
          {/* Left Sidebar */}
          <aside id="sidebar">
            <div class="sidebar-header">
              <span class="brand-badge">⚡</span>
              <div class="brand-text">
                <span class="brand-title">A股摸鱼</span>
                <span class="brand-sub">配置中心</span>
              </div>
            </div>

            <nav class="sidebar-nav">
              <For each={TABS}>
                {(tab) => (
                  <button
                    type="button"
                    class="nav-tab-btn"
                    classList={{ active: activeTab() === tab.id }}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span class="tab-icon">{tab.icon}</span>
                    <div class="tab-text">
                      <span class="tab-label">{tab.label}</span>
                      <span class="tab-desc">{tab.desc}</span>
                    </div>
                  </button>
                )}
              </For>
            </nav>
          </aside>

          {/* Right Main Content Panel */}
          <section id="main-panel">
            <div class="content-body">
              {/* Tab 1: 自选标的 */}
              <Show when={activeTab() === 'watchlist'}>
                <div class="tab-pane">
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

                  <div class="card">
                    <div class="card-title-row">
                      <h2>同花顺问财 API 配置</h2>
                      <span class="card-badge">大盘全景增强</span>
                    </div>
                    <p class="hint">
                      用于大盘全景界面的全市场精确涨跌家数与两市成交额环比分析（未配置时自动探测本地环境或使用基线缓存）。
                    </p>
                    <div class="field">
                      <label for="iwencai-key">问财 API Key (IWENCAI_API_KEY)</label>
                      <input
                        id="iwencai-key"
                        type="password"
                        placeholder="sk-proj-00-..."
                        value={form.iwencaiApiKey ?? ''}
                        onInput={(e) => setForm('iwencaiApiKey', e.currentTarget.value.trim() || undefined)}
                      />
                    </div>
                  </div>

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
                      update={updateItem}
                      add={addItem}
                      addWithItem={addItemWith}
                      remove={removeItem}
                      move={moveItem}
                      sort={sortItems}
                      addLine={addLine}
                      updateLine={updateLine}
                      removeLine={removeLine}
                      onToast={(text, kind) => say(text, kind)}
                    />
                  </div>
                </div>
              </Show>

              {/* Tab 2: 外观与悬浮 */}
              <Show when={activeTab() === 'appearance'}>
                <div class="tab-pane">
                  <div class="card">
                    <div class="card-title-row">
                      <h2>默认显示形态</h2>
                      <span class="card-badge">随时按快捷键切换</span>
                    </div>
                    <p class="hint">选择启动时默认呈现的形态，可在托盘菜单或按快捷键随时切换。</p>
                    <div class="grid-options col-3">
                      <For each={LAYOUTS}>
                        {(opt) => (
                          <div
                            class="opt-card"
                            classList={{ active: form.layout === opt.value }}
                            onClick={() => setForm('layout', opt.value)}
                          >
                            <div class="opt-head">
                              <span class="opt-icon">{opt.icon}</span>
                              <span class="opt-badge">{opt.badge}</span>
                            </div>
                            <span class="opt-name">{opt.name}</span>
                            <span class="opt-desc">{opt.desc}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  <div class="card">
                    <div class="card-title-row">
                      <h2>窗口显隐与贴边收起策略</h2>
                      <span class="card-badge">防窥避险</span>
                    </div>
                    <p class="hint">
                      拖动窗口贴近屏幕<strong>左、右、顶</strong>边缘时触发。在屏幕中央位置时保持常显。
                    </p>
                    <div class="grid-options col-2">
                      <For each={VISIBILITIES}>
                        {(opt) => (
                          <div
                            class="opt-card"
                            classList={{ active: (form.visibilityMode ?? 'always') === opt.value }}
                            onClick={() => setForm('visibilityMode', opt.value)}
                          >
                            <div class="opt-head">
                              <span class="opt-icon">{opt.icon}</span>
                            </div>
                            <span class="opt-name">{opt.name}</span>
                            <span class="opt-desc">{opt.desc}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  <div class="card">
                    <div class="card-title-row">
                      <h2>窗口透明度与尺寸记忆</h2>
                    </div>
                    <div class="field">
                      <label for="opacity">
                        窗口透明度 <output>{Math.round(form.opacity * 100)}%</output>
                      </label>
                      <input
                        id="opacity"
                        type="range"
                        min="30"
                        max="100"
                        step="1"
                        value={Math.round(form.opacity * 100)}
                        onInput={(e) => setForm('opacity', Number(e.currentTarget.value) / 100)}
                      />
                    </div>
                    <div class="field" style={{ "margin-top": "12px" }}>
                      <label>窗口尺寸记忆</label>
                      <div class="inline">
                        <span class="muted">{sizesText()}</span>
                        <button
                          type="button"
                          class="ghost"
                          onClick={() => {
                            setForm('layoutSizes', {})
                            say('已重置记住的窗口尺寸，保存后生效', 'ok')
                          }}
                        >
                          恢复默认尺寸
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Tab 3: 提醒与刷新 */}
              <Show when={activeTab() === 'alerts'}>
                <div class="tab-pane">
                  <div class="card">
                    <div class="card-title-row">
                      <h2>行情轮询频率</h2>
                    </div>
                    <p class="hint">非交易时段完全停止网络请求；休市与节假日自动降频以节省系统资源。</p>
                    <div class="field">
                      <label for="poll-quotes">最新报价刷新间隔（毫秒）</label>
                      <input
                        id="poll-quotes"
                        type="number"
                        min="1000"
                        max="60000"
                        step="500"
                        value={form.pollQuotesMs}
                        onInput={(e) => setForm('pollQuotesMs', Number(e.currentTarget.value))}
                      />
                    </div>
                    <div class="field">
                      <label for="poll-trend">分时走势刷新间隔（毫秒）</label>
                      <input
                        id="poll-trend"
                        type="number"
                        min="5000"
                        max="600000"
                        step="1000"
                        value={form.pollTrendMs}
                        onInput={(e) => setForm('pollTrendMs', Number(e.currentTarget.value))}
                      />
                    </div>
                  </div>

                  <div class="card">
                    <div class="card-title-row">
                      <h2>异动告警与通知</h2>
                    </div>
                    <div class="field">
                      <label for="alert-pct">全局涨跌提醒阈值（±%）</label>
                      <input
                        id="alert-pct"
                        type="number"
                        min="0.1"
                        max="50"
                        step="0.1"
                        value={form.alertPct}
                        onInput={(e) => setForm('alertPct', Number(e.currentTarget.value))}
                      />
                    </div>
                    <label class="check">
                      <input
                        type="checkbox"
                        checked={form.notifications}
                        onChange={(e) => setForm('notifications', e.currentTarget.checked)}
                      />
                      <span>触发到价或大幅波动时弹出系统气泡通知（未勾选则仅边框柔和闪烁）</span>
                    </label>
                  </div>

                  <div class="card">
                    <div class="card-title-row">
                      <h2>盘口即时异动告警 (Real-time Anomaly)</h2>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={form.anomalyAlerts?.rapidChange ?? true}
                          onChange={(e) => setForm('anomalyAlerts', 'rapidChange', e.currentTarget.checked)}
                        />
                        <span>🚀 急速拉升 / 急速跳水提醒（短线 1~2 分钟涨跌速超过 ±1.5%）</span>
                      </label>
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={form.anomalyAlerts?.intradayExtremes ?? true}
                          onChange={(e) => setForm('anomalyAlerts', 'intradayExtremes', e.currentTarget.checked)}
                        />
                        <span>📈 突破日内新高 / 跌破新低提醒（盘中刷新日内极值）</span>
                      </label>
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={form.anomalyAlerts?.volumeBurst ?? true}
                          onChange={(e) => setForm('anomalyAlerts', 'volumeBurst', e.currentTarget.checked)}
                        />
                        <span>💥 盘口大单扫盘/砸盘提醒（短时间爆量 3 倍以上且有买卖推升打压）</span>
                      </label>
                      <label class="check">
                        <input
                          type="checkbox"
                          checked={form.anomalyAlerts?.limitBoard ?? true}
                          onChange={(e) => setForm('anomalyAlerts', 'limitBoard', e.currentTarget.checked)}
                        />
                        <span>🔴 接近涨跌停 / 涨停炸板提醒（逼近涨停或封板后开板）</span>
                      </label>
                    </div>
                  </div>

                  <div class="card">
                    <div class="card-title-row">
                      <h2>走势判断引擎 (Trend Engine)</h2>
                    </div>
                    <label class="check">
                      <input
                        type="checkbox"
                        checked={form.trendEngine}
                        onChange={(e) => setForm('trendEngine', e.currentTarget.checked)}
                      />
                      <span>启用本地分时走势判断（基于均线乖离、量价背离与突破回踩，实时诊断短线多空形态）</span>
                    </label>
                  </div>
                </div>
              </Show>

              {/* Tab 4: 快捷键与系统 */}
              <Show when={activeTab() === 'system'}>
                <div class="tab-pane">
                  <div class="card">
                    <div class="card-title-row">
                      <h2>全局热键设置</h2>
                    </div>
                    <p class="hint">
                      推荐使用 <code>Ctrl+Alt</code> 组合键（避免与 Windows 中文输入法 <code>Ctrl+Shift</code> 冲突）。
                    </p>
                    <For each={HOTKEY_FIELDS}>
                      {([key, label, desc]) => (
                        <div class="field hotkey-field">
                          <div class="hotkey-label-group">
                            <label for={`key-${key}`}>{label}</label>
                            <span class="hotkey-sub-desc">{desc}</span>
                          </div>
                          <input
                            id={`key-${key}`}
                            type="text"
                            spellcheck={false}
                            value={form.hotkeys[key]}
                            onInput={(e) => setForm('hotkeys', key, e.currentTarget.value)}
                          />
                        </div>
                      )}
                    </For>
                  </div>

                  <div class="card">
                    <div class="card-title-row">
                      <h2>系统环境行为</h2>
                    </div>
                    <label class="check">
                      <input
                        type="checkbox"
                        checked={form.autostart}
                        onChange={(e) => setForm('autostart', e.currentTarget.checked)}
                      />
                      <span>开机自动在后台启动挂件</span>
                    </label>
                  </div>
                </div>
              </Show>
            </div>

            {/* Bottom Actions Bar */}
            <footer id="footer-bar">
              <div id="status-msg" class={msg().kind}>
                {msg().text}
              </div>
              <div class="footer-btns">
                <button type="button" class="btn-ghost" onClick={() => void getCurrentWindow().close()}>
                  关闭
                </button>
                <button type="button" class="btn-primary" disabled={!ready()} onClick={() => void save()}>
                  保存并刷新生效
                </button>
              </div>
            </footer>
          </section>
        </div>
      </Show>
    </div>
  )
}
