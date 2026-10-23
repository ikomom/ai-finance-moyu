import type { SectorItem } from '../types'

export interface MarketStyleInfo {
  type: 'offensive' | 'defensive' | 'weight' | 'neutral'
  badge: string
  label: string
  description: string
  topSectors: Array<{ name: string; pct: number; leader?: string }>
}

const OFFENSIVE_KEYWORDS = [
  '半导体', '芯片', '电子', '软件', '计算机', '算力', '通信',
  '人工智能', 'AI', '机器人', '低空经济', '军工', '航天', '光伏', '电池', '新能源'
]
const WEIGHT_KEYWORDS = ['银行', '证券', '保险', '中字头', '建筑', '央企', '白酒', '酿酒', '房地产']
const DEFENSIVE_KEYWORDS = ['煤炭', '石油', '石化', '电力', '公用事业', '燃气', '港口', '医药', '中药', '贵金属', '黄金']

export function extractStyle(sectors?: SectorItem[]): MarketStyleInfo {
  const top = (sectors ?? []).slice(0, 3)
  const topSectors = top.map((s) => ({
    name: s.name,
    pct: s.changePct,
    leader: s.leadStockName
      ? `${s.leadStockName}${s.leadStockZdf != null ? ` (${s.leadStockZdf >= 0 ? '+' : ''}${s.leadStockZdf.toFixed(1)}%)` : ''}`
      : undefined,
  }))

  if (top.length === 0) {
    return {
      type: 'neutral',
      badge: '⚖️ 均衡轮动',
      label: '板块轮动',
      description: '暂无明显主线领涨，资金分散轮动',
      topSectors: [],
    }
  }

  let offensiveCount = 0
  let weightCount = 0
  let defensiveCount = 0

  for (const s of top) {
    if (OFFENSIVE_KEYWORDS.some((k) => s.name.includes(k))) offensiveCount++
    if (WEIGHT_KEYWORDS.some((k) => s.name.includes(k))) weightCount++
    if (DEFENSIVE_KEYWORDS.some((k) => s.name.includes(k))) defensiveCount++
  }

  if (offensiveCount >= weightCount && offensiveCount >= defensiveCount && offensiveCount > 0) {
    return {
      type: 'offensive',
      badge: '🚀 科技进攻',
      label: '科技进攻',
      description: '游资与活跃资金入场，市场风险偏好较高',
      topSectors,
    }
  }

  if (weightCount >= offensiveCount && weightCount >= defensiveCount && weightCount > 0) {
    return {
      type: 'weight',
      badge: '🏛️ 权重维稳',
      label: '权重维稳',
      description: '机构或主力资金护盘维稳，警惕二八分化',
      topSectors,
    }
  }

  if (defensiveCount > 0) {
    return {
      type: 'defensive',
      badge: '🛡️ 防御避险',
      label: '避险防御',
      description: '避险情绪升温，资金抱团高股息与抗周期防御',
      topSectors,
    }
  }

  return {
    type: 'neutral',
    badge: '⚖️ 均衡轮动',
    label: '结构轮动',
    description: '板块快速电风扇轮动，主线持续性较弱',
    topSectors,
  }
}
