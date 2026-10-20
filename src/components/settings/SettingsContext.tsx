import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type JSX,
} from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getVersion } from '@tauri-apps/api/app'

import { logToBackend } from '../../tauri'

import { checkAppUpdate, clearSkippedVersion, type CheckResult } from '../../services/updater'
import type { Config, DataSource, Snapshot } from '../../types'

export * from './settingsMeta'
import type { TabKey } from './settingsMeta'
import { createWatchlistActions } from './watchlistActions'

import type { SettingsContextValue } from './settingsTypes'
export type { SettingsContextValue }

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
  /**
   * The iWenCai key never reaches the webview, so the form starts empty and
   * this flag drives the "已保存（留空表示不修改）" hint instead.
   */
  const [hasIwenCaiKey, setHasIwenCaiKey] = createSignal(false)

  const say = (text: string, kind: '' | 'ok' | 'bad' = '') => setMsg({ text, kind })

  createEffect(() => {
    const theme = form.theme ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  })

  onMount(async () => {
    const mountStarted = performance.now()
    try {
      const snapshot = await invoke<Snapshot>('get_snapshot')
      setSources(await invoke<Array<[DataSource, string]>>('data_sources'))
      setForm({
        ...snapshot.config,
        theme: snapshot.config.theme ?? 'dark',
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
        iwencaiApiKey: '',
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
      setHasIwenCaiKey(Boolean(snapshot.hasIwenCaiKey))
      // One line per open: how long the window took to become usable.
      logToBackend(`设置页就绪 ${Math.round(performance.now() - mountStarted)}ms`)
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
          setIsUpdateModalOpen(true)
        }
      } catch {
        // 静默检查网络故障不打扰用户
      }
    }, 1500)
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
      clearSkippedVersion()
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

  const {
    updateItem,
    addItem,
    addItemWith,
    removeItem,
    moveItem,
    sortItems,
    addLine,
    updateLine,
    removeLine,
  } = createWatchlistActions(setForm, say)
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
    hasIwenCaiKey,
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
