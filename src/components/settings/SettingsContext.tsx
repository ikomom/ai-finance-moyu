import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type JSX,
  type Setter,
} from 'solid-js'
import { createStore, unwrap, type SetStoreFunction } from 'solid-js/store'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getVersion } from '@tauri-apps/api/app'

import { checkAppUpdate, type CheckResult } from '../../services/updater'
import type { Config, DataSource, Layout, PriceLine, Snapshot, VisibilityMode, WatchItem } from '../../types'

export type TabKey = 'watchlist' | 'appearance' | 'alerts' | 'system' | 'logs'

export interface TabInfo {
  id: TabKey
  label: string
  icon: string
  desc: string
}

export const TABS: TabInfo[] = [
  { id: 'watchlist', label: '自选标的', icon: '📊', desc: '数据源与股票池' },
  { id: 'appearance', label: '外观悬浮', icon: '🎨', desc: '形态与吸附策略' },
  { id: 'alerts', label: '提醒刷新', icon: '🔔', desc: '频率与到价告警' },
  { id: 'system', label: '按键系统', icon: '⌨️', desc: '老板键与自启动' },
  { id: 'logs', label: '运行日志', icon: '📋', desc: '异动留痕与运行记录' },
]

export const SOURCE_NOTES: Record<string, string> = {
  tencent: '批量高效报价，分时接口直接提供精准累计量额（推荐）',
  sina: '老牌行情源，需带 Referer 校验，分时每分钟量额由本地累加',
}

export const LAYOUTS: Array<{ value: Layout; name: string; badge: string; desc: string; icon: string }> = [
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
    badge: 'A股温度',
    desc: 'A股三大指数 + 涨跌分布多空温度计 + 两市成交量 + 领涨板块',
    icon: '🧭',
  },
  {
    value: 'global',
    name: '全球股指',
    badge: '全球市场',
    desc: '美股三大指数、恒生指数、日经225、韩国KOSPI与日K线走势',
    icon: '🌐',
  },
]

export const VISIBILITIES: Array<{ value: VisibilityMode; name: string; desc: string; icon: string }> = [
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

export const HOTKEY_FIELDS = [
  ['toggle', '显示 / 隐藏（老板键）', '任意时刻一键隐藏/唤起主挂件'],
  ['layoutBar', '快捷切换到数字条', '快速切到 32px 极简单行胶囊'],
  ['layoutMini', '快捷切换到迷你图', '快速查看当前选中的标的分时大图'],
  ['layoutList', '快捷切换到列表', '快速展开全量自选列表与走势 Sparkline'],
  ['layoutMarket', '快捷切换到大盘全景', '一键查看三大指数、涨跌家数与热门板块'],
  ['layoutGlobal', '快捷切换到全球股指', '一键查看美股、港股、亚太主要股指与日K走势'],
] as const

export interface SettingsContextValue {
  form: Config
  setForm: SetStoreFunction<Config>
  sources: Accessor<Array<[DataSource, string]>>
  ready: Accessor<boolean>
  activeTab: Accessor<TabKey>
  setActiveTab: Setter<TabKey>
  msg: Accessor<{ text: string; kind: '' | 'ok' | 'bad' }>
  say: (text: string, kind?: '' | 'ok' | 'bad') => void

  currentAppVersion: Accessor<string>
  updateResult: Accessor<CheckResult | null>
  setUpdateResult: Setter<CheckResult | null>
  isCheckingUpdate: Accessor<boolean>
  isUpdateModalOpen: Accessor<boolean>
  setIsUpdateModalOpen: Setter<boolean>
  updateCheckMsg: Accessor<string>

  handleManualCheckUpdate: () => Promise<void>
  handleOpenReleasePage: () => Promise<void>
  save: () => Promise<void>
  sizesText: () => string

  updateItem: (i: number, patch: Partial<WatchItem>) => void
  addItem: () => void
  addItemWith: (item: WatchItem) => void
  removeItem: (i: number) => void
  moveItem: (from: number, to: number) => void
  sortItems: (criterion: 'code-asc' | 'code-desc' | 'name' | 'holding' | 'reverse') => void
  addLine: (i: number) => void
  updateLine: (i: number, li: number, patch: Partial<PriceLine>) => void
  removeLine: (i: number, li: number) => void
}

const SettingsContext = createContext<SettingsContextValue>()

export function SettingsProvider(props: { children: JSX.Element }) {
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
      layoutGlobal: 'ctrl+alt+5',
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

  const [currentAppVersion, setCurrentAppVersion] = createSignal('0.1.0')
  const [updateResult, setUpdateResult] = createSignal<CheckResult | null>(null)
  const [isCheckingUpdate, setIsCheckingUpdate] = createSignal(false)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = createSignal(false)
  const [updateCheckMsg, setUpdateCheckMsg] = createSignal('')

  const say = (text: string, kind: '' | 'ok' | 'bad' = '') => setMsg({ text, kind })

  onMount(async () => {
    try {
      const snapshot = await invoke<Snapshot>('get_snapshot')
      setSources(await invoke<Array<[DataSource, string]>>('data_sources'))
      setForm({
        ...snapshot.config,
        hotkeys: {
          ...snapshot.config.hotkeys,
          layoutMarket: snapshot.config.hotkeys.layoutMarket ?? 'ctrl+alt+4',
          layoutGlobal: snapshot.config.hotkeys.layoutGlobal ?? 'ctrl+alt+5',
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

    getVersion().then((v) => setCurrentAppVersion(v)).catch(() => {})

    let unlistenTray: (() => void) | undefined
    listen('trigger-check-update', () => {
      setActiveTab('system')
      void handleManualCheckUpdate()
    }).then((unlisten) => {
      unlistenTray = unlisten
    })
    onCleanup(() => {
      if (unlistenTray) unlistenTray()
    })

    const bgTimer = setTimeout(async () => {
      try {
        const res = await checkAppUpdate(false)
        setUpdateResult(res)
        if (res.hasUpdate) {
          setUpdateCheckMsg(`发现新版本 v${res.newVersion}`)
        }
      } catch {
        // 静默检查网络故障不打扰用户
      }
    }, 5000)
    onCleanup(() => clearTimeout(bgTimer))
  })

  const handleOpenReleasePage = async () => {
    const url = 'https://github.com/ikomom/ai-finance-moyu/releases/latest'
    try {
      await invoke('open_url', { url })
    } catch {
      window.open(url, '_blank')
    }
  }

  const handleManualCheckUpdate = async () => {
    if (isCheckingUpdate()) return
    setIsCheckingUpdate(true)
    setUpdateCheckMsg('正在检查更新…')
    try {
      const res = await checkAppUpdate(true)
      setUpdateResult(res)
      if (res.hasUpdate) {
        setUpdateCheckMsg(`发现新版本 v${res.newVersion}`)
        setIsUpdateModalOpen(true)
      } else {
        setUpdateCheckMsg(`当前已是最新版本 (v${res.currentVersion})`)
        say(`当前已是最新版本 (v${res.currentVersion})`, 'ok')
      }
    } catch (err) {
      const errorStr = err instanceof Error ? err.message : String(err)
      setUpdateCheckMsg(`检查更新异常`)
      say(`检查更新失败：${errorStr}`, 'bad')
    } finally {
      setIsCheckingUpdate(false)
    }
  }

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
    return (['bar', 'mini', 'list', 'market', 'global'] as const)
      .map((k) => {
        const v = s[k]
        const name =
          k === 'bar'
            ? '数字条'
            : k === 'mini'
              ? '迷你图'
              : k === 'list'
                ? '列表'
                : k === 'market'
                  ? '大盘全景'
                  : '全球股指'
        return `${name} ${v ? `${Math.round(v[0])}×${Math.round(v[1])}` : '默认'}`
      })
      .join(' · ')
  }

  const value: SettingsContextValue = {
    form,
    setForm,
    sources,
    ready,
    activeTab,
    setActiveTab,
    msg,
    say,
    currentAppVersion,
    updateResult,
    setUpdateResult,
    isCheckingUpdate,
    isUpdateModalOpen,
    setIsUpdateModalOpen,
    updateCheckMsg,
    handleManualCheckUpdate,
    handleOpenReleasePage,
    save,
    sizesText,
    updateItem,
    addItem,
    addItemWith,
    removeItem,
    moveItem,
    sortItems,
    addLine,
    updateLine,
    removeLine,
  }

  return <SettingsContext.Provider value={value}>{props.children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return ctx
}
