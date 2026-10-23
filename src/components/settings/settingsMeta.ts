//! Static metadata backing the settings UI: tab list, theme palettes, layout
//! and visibility copy, hotkey field labels.
//!
//! Split from `SettingsContext.tsx` so the provider file holds behaviour only
//! (and both stay inside the 300-line budget, AGENTS.md §11).

import type { Layout, ThemeOption, VisibilityMode } from '../../types'

export type TabKey = 'watchlist' | 'appearance' | 'alerts' | 'ai' | 'system' | 'logs'

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
  { id: 'ai', label: 'AI 决策', icon: '🤖', desc: 'Jev/Laya 决策模型与服务' },
  { id: 'system', label: '系统设置', icon: '⚙️', desc: '热键、自启动与版本更新' },
  { id: 'logs', label: '运行日志', icon: '📋', desc: '异动留痕与运行记录' },
]

export const SOURCE_NOTES: Record<string, string> = {
  tencent: '批量高效报价，分时接口直接提供精准累计量额（推荐）',
  sina: '老牌行情源，需带 Referer 校验，分时每分钟量额由本地累加',
}

export const THEMES: ThemeOption[] = [
  {
    value: 'dark',
    name: '深邃暗黑',
    badge: '经典默认',
    desc: '低调深灰暗黑毛玻璃材质，夜间与深色壁纸绝佳搭配',
    icon: '🌙',
    palette: {
      bg: '#0d0f14',
      card: '#161a23',
      border: 'rgba(255,255,255,0.12)',
      accent: '#4b8ef7',
      text: '#f3f4f6',
      up: '#eb4d4b',
      down: '#2ecc71',
    },
  },
  {
    value: 'light',
    name: '办公浅色',
    badge: '防窥摸鱼',
    desc: '白底极简高仿 Excel/Word/办公软件，白天办公不显突兀',
    icon: '☀️',
    palette: {
      bg: '#f1f5f9',
      card: '#ffffff',
      border: 'rgba(0,0,0,0.12)',
      accent: '#2563eb',
      text: '#0f172a',
      up: '#dc2626',
      down: '#16a34a',
    },
  },
  {
    value: 'transparent',
    name: '极致透明',
    badge: '无界桌面',
    desc: '超高透度极简无界悬浮，文字若隐若现贴合桌面壁纸',
    icon: '🪟',
    palette: {
      bg: 'rgba(10,14,22,0.4)',
      card: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.14)',
      accent: '#38bdf8',
      text: '#ffffff',
      up: '#eb4d4b',
      down: '#2ecc71',
    },
  },
  {
    value: 'ocean',
    name: '科技曜青',
    badge: '深海曜蓝',
    desc: '深邃藏青底色搭配冰晶天蓝微光与青色点缀，精致现代',
    icon: '🌊',
    palette: {
      bg: '#070d1a',
      card: '#0c1834',
      border: 'rgba(56,189,248,0.25)',
      accent: '#0ea5e9',
      text: '#f0f9ff',
      up: '#f43f5e',
      down: '#10b981',
    },
  },
  {
    value: 'cyberpunk',
    name: '赛博终端',
    badge: '极客荧光',
    desc: '纯黑极客底色搭配高对比度荧光绿，交易员硬核风格',
    icon: '⚡',
    palette: {
      bg: '#030507',
      card: '#060e0b',
      border: 'rgba(0,255,136,0.35)',
      accent: '#00ff88',
      text: '#e6fffa',
      up: '#ff3366',
      down: '#00ff88',
    },
  },
]

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

