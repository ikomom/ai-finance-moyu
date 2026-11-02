import type { CustomSeatMapping, SeatCategory } from '../dragon_tiger/types'
import { FAMOUS_BRANCH_LIST } from '../dragon_tiger/seatDict'
import { POPULAR_TRADERS } from './popularTraders'

export interface SeatBranchItem {
  id: string
  keyword: string
  enabled: boolean
}

export interface FocusSeatEntity {
  id: string
  name: string
  category: SeatCategory
  enabled: boolean
  branches: SeatBranchItem[]
  desc?: string
}

/**
 * Group flat CustomSeatMapping rules by trader/seat label into FocusSeatEntities.
 */
export function groupSeatsToEntities(mappings: CustomSeatMapping[]): FocusSeatEntity[] {
  const map = new Map<string, FocusSeatEntity>()

  for (const m of mappings) {
    const label = m.label.trim()
    if (!label) continue

    const existing = map.get(label)
    const branchItem: SeatBranchItem = {
      id: m.id,
      keyword: m.branch_keyword,
      enabled: m.enabled,
    }

    if (existing) {
      existing.branches.push(branchItem)
      // If any branch is enabled, treat entity as enabled
      if (m.enabled) {
        existing.enabled = true
      }
    } else {
      const preset = POPULAR_TRADERS.find((p) => p.name === label)
      map.set(label, {
        id: `entity-${label}-${Date.now()}`,
        name: label,
        category: (m.category as SeatCategory) || (preset?.category ?? 'trader'),
        enabled: m.enabled,
        branches: [branchItem],
        desc: preset?.desc,
      })
    }
  }

  return Array.from(map.values())
}

/**
 * Flatten FocusSeatEntities back to flat CustomSeatMapping rules for persistence.
 */
export function flattenEntitiesToSeats(entities: FocusSeatEntity[]): CustomSeatMapping[] {
  const result: CustomSeatMapping[] = []

  for (const entity of entities) {
    for (const b of entity.branches) {
      result.push({
        id: b.id,
        branch_keyword: b.keyword,
        label: entity.name,
        category: entity.category,
        enabled: entity.enabled && b.enabled,
      })
    }
  }

  return result
}

/**
 * Search suggestion candidates from dictionary and presets.
 */
export interface SeatSuggestionItem {
  name: string
  branchKeywords: string[]
  category: SeatCategory
  sourceDesc: string
}

export function searchSeatSuggestions(query: string, existingNames: string[]): SeatSuggestionItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const results: SeatSuggestionItem[] = []
  const seen = new Set<string>(existingNames.map((n) => n.toLowerCase()))

  // 1. Match from presets first
  for (const p of POPULAR_TRADERS) {
    if (seen.has(p.name.toLowerCase())) continue
    if (
      p.name.toLowerCase().includes(q) ||
      p.branchKeywords.some((kw) => kw.toLowerCase().includes(q))
    ) {
      results.push({
        name: p.name,
        branchKeywords: p.branchKeywords,
        category: p.category,
        sourceDesc: p.desc,
      })
      seen.add(p.name.toLowerCase())
    }
  }

  // 2. Match from famous branch list
  for (const item of FAMOUS_BRANCH_LIST) {
    const label = item.traderLabel
    if (!label || seen.has(label.toLowerCase())) continue

    const matchesName = label.toLowerCase().includes(q)
    const matchesBranch = item.branchName.toLowerCase().includes(q)
    const matchesKw = item.keywords.some((k) => k.toLowerCase().includes(q))

    if (matchesName || matchesBranch || matchesKw) {
      const cat: SeatCategory =
        label === '机构专用'
          ? 'institution'
          : label === '北向外资'
          ? 'north'
          : label === '拉萨天团'
          ? 'retail'
          : label.includes('量化')
          ? 'quant'
          : 'trader'

      results.push({
        name: label,
        branchKeywords: [item.branchName],
        category: cat,
        sourceDesc: item.branchName,
      })
      seen.add(label.toLowerCase())
    }
  }

  return results.slice(0, 6)
}
