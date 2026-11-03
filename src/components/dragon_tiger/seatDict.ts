//! Comprehensive brokerage branch & famous trader seat dictionary for search & suggestions.

import type { CustomSeatMapping, SeatCategory } from './types'
import { fetchCustomSeats } from '../../tauri'

export interface BranchDictItem {
  branchName: string
  traderLabel?: string
  keywords: string[]
}

// In-memory synced custom seat mappings for reactive fast lookup
let cachedCustomSeats: CustomSeatMapping[] = []

export async function syncCustomSeats(): Promise<CustomSeatMapping[]> {
  try {
    const list = await fetchCustomSeats()
    if (list && list.length > 0) {
      cachedCustomSeats = list
    }
  } catch {}
  return cachedCustomSeats
}

// Auto-sync on import
void syncCustomSeats()

// Listen for updates from settings window across Tauri windows
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    void listen('custom-seats-updated', () => {
      void syncCustomSeats()
    })
  }).catch(() => {})
}

export function getCachedCustomSeats(): CustomSeatMapping[] {
  return cachedCustomSeats
}

/**
 * Resolve display label and visual category for a branch name.
 * Custom seat mappings take precedence over backend labels.
 */
export function resolveSeatLabel(
  branchName: string,
  backendLabel?: string | null
): { label: string; category: SeatCategory } | null {
  const clean = branchName.trim()
  if (!clean) return null

  // 1. Try matching enabled custom seat rules first
  for (const item of cachedCustomSeats) {
    if (!item.enabled) continue
    const kw = item.branch_keyword.trim()
    if (kw && (clean.includes(kw) || kw.includes(clean))) {
      return { label: item.label, category: item.category }
    }
  }

  // 2. Fall back to backend trader label if provided
  if (backendLabel && backendLabel.trim()) {
    const b = backendLabel.trim()
    const cat: SeatCategory =
      b === '机构专用' ? 'institution' : b === '北向外资' ? 'north' : 'trader'
    return { label: b, category: cat }
  }

  // 3. Fall back to default dictionary
  for (const item of FAMOUS_BRANCH_LIST) {
    if (clean.includes(item.branchName) || item.branchName.includes(clean)) {
      if (item.traderLabel) {
        const cat: SeatCategory =
          item.traderLabel === '机构专用'
            ? 'institution'
            : item.traderLabel === '北向外资'
            ? 'north'
            : item.traderLabel === '拉萨天团'
            ? 'retail'
            : item.traderLabel.includes('量化')
            ? 'quant'
            : 'trader'
        return { label: item.traderLabel, category: cat }
      }
    }
  }

  return null
}

export const FAMOUS_BRANCH_LIST: BranchDictItem[] = [
  // 知名游资核心席位
  {
    branchName: '华泰证券股份有限公司福州六一中路证券营业部',
    traderLabel: '六一路',
    keywords: ['六一路', '福州六一中路', '华泰福州', 'lyl'],
  },
  {
    branchName: '中信建投证券股份有限公司北京东城分公司',
    traderLabel: '呼家楼',
    keywords: ['呼家楼', '北京东城', '东城分公司', 'hjl'],
  },
  {
    branchName: '中信证券股份有限公司北京呼家楼证券营业部',
    traderLabel: '呼家楼',
    keywords: ['呼家楼', '北京呼家楼', 'hjl'],
  },
  {
    branchName: '国泰君安证券股份有限公司上海江苏路证券营业部',
    traderLabel: '章盟主',
    keywords: ['章盟主', '江苏路', '上海江苏路', 'zmz'],
  },
  {
    branchName: '海通证券股份有限公司上海毛家弄证券营业部',
    traderLabel: '章盟主',
    keywords: ['章盟主', '毛家弄', '上海毛家弄', 'zmz'],
  },
  {
    branchName: '中信证券股份有限公司西安朱雀大街证券营业部',
    traderLabel: '方新侠',
    keywords: ['方新侠', '朱雀大街', '西安朱雀大街', 'fxx'],
  },
  {
    branchName: '银泰证券有限责任公司大连黄河路证券营业部',
    traderLabel: '陈小群',
    keywords: ['陈小群', '大连黄河路', '黄河路', 'cxq'],
  },
  {
    branchName: '中国银河证券股份有限公司绍兴证券营业部',
    traderLabel: '赵老哥',
    keywords: ['赵老哥', '银河绍兴', '绍兴解放南路', 'zlg'],
  },
  {
    branchName: '国泰君安证券股份有限公司南京太平南路证券营业部',
    traderLabel: '作手新一',
    keywords: ['作手新一', '南京太平南路', '太平南路', 'zsxy'],
  },
  {
    branchName: '华鑫证券有限责任公司上海宛平南路证券营业部',
    traderLabel: '炒股养家',
    keywords: ['炒股养家', '宛平南路', '上海宛平南路', 'cgyj'],
  },
  {
    branchName: '华鑫证券有限责任公司上海茅台路证券营业部',
    traderLabel: '炒股养家',
    keywords: ['炒股养家', '茅台路', '上海茅台路', 'cgyj'],
  },
  {
    branchName: '财通证券股份有限公司杭州上塘路证券营业部',
    traderLabel: '上塘路',
    keywords: ['上塘路', '杭州上塘路', 'stl'],
  },
  {
    branchName: '中信证券股份有限公司上海溧阳路证券营业部',
    traderLabel: '孙哥',
    keywords: ['孙哥', '溧阳路', '上海溧阳路', 'sg'],
  },
  {
    branchName: '国盛证券有限责任公司宁波桑田路证券营业部',
    traderLabel: '桑田路',
    keywords: ['桑田路', '宁波桑田路', 'stl'],
  },
  {
    branchName: '安信证券股份有限公司厦门湖西路证券营业部',
    traderLabel: '东北猛男',
    keywords: ['东北猛男', '湖西路', '厦门湖西路', 'dbmn'],
  },
  {
    branchName: '华鑫证券有限责任公司深圳益田路证券营业部',
    traderLabel: '益田路',
    keywords: ['益田路', '深圳益田路', 'ytl'],
  },
  // 机构、外资与量化
  {
    branchName: '机构专用',
    traderLabel: '机构专用',
    keywords: ['机构', '机构专用', 'jgzy'],
  },
  {
    branchName: '深股通专用',
    traderLabel: '北向外资',
    keywords: ['北向', '外资', '深股通', 'sgt'],
  },
  {
    branchName: '沪股通专用',
    traderLabel: '北向外资',
    keywords: ['北向', '外资', '沪股通', 'hgt'],
  },
  {
    branchName: '华泰证券股份有限公司总部',
    traderLabel: '量化打板',
    keywords: ['量化', '华泰总部', '华泰证券总部', 'lhdb'],
  },
  {
    branchName: '中国国际金融股份有限公司上海分公司',
    traderLabel: '量化打板',
    keywords: ['中金上海', '量化', '中金分公司', 'zjsg'],
  },
  // 人气席位（拉萨天团）
  {
    branchName: '东方财富证券股份有限公司拉萨团结路第一证券营业部',
    traderLabel: '拉萨天团',
    keywords: ['拉萨', '团结路', '拉萨团结路一', 'lstt'],
  },
  {
    branchName: '东方财富证券股份有限公司拉萨团结路第二证券营业部',
    traderLabel: '拉萨天团',
    keywords: ['拉萨', '团结路', '拉萨团结路二', 'lstt'],
  },
  {
    branchName: '东方财富证券股份有限公司拉萨东环路第一证券营业部',
    traderLabel: '拉萨天团',
    keywords: ['拉萨', '东环路', '拉萨东环路一', 'lstt'],
  },
  {
    branchName: '东方财富证券股份有限公司拉萨东环路第二证券营业部',
    traderLabel: '拉萨天团',
    keywords: ['拉萨', '东环路', '拉萨东环路二', 'lstt'],
  },
]

/**
 * Fuzzy search brokerage branches by query keyword.
 */
export function searchBranchDictionary(query: string): BranchDictItem[] {
  const clean = query.trim().toLowerCase()
  if (!clean) return []

  const customItems: BranchDictItem[] = cachedCustomSeats
    .filter((s) => s.enabled)
    .map((s) => ({
      branchName: s.branch_keyword,
      traderLabel: s.label,
      keywords: [s.branch_keyword, s.label],
    }))

  const combined = [...customItems, ...FAMOUS_BRANCH_LIST]
  const seen = new Set<string>()

  return combined.filter((item) => {
    if (seen.has(item.branchName)) return false
    const match =
      item.branchName.toLowerCase().includes(clean) ||
      (item.traderLabel && item.traderLabel.toLowerCase().includes(clean)) ||
      item.keywords.some((k) => k.toLowerCase().includes(clean))
    if (match) {
      seen.add(item.branchName)
      return true
    }
    return false
  })
}
