import { describe, it, expect } from 'vitest'
import {
  groupSeatsToEntities,
  flattenEntitiesToSeats,
  searchSeatSuggestions,
} from './seatEntities'
import type { CustomSeatMapping } from '../dragon_tiger/types'

describe('seatEntities utility', () => {
  const sampleMappings: CustomSeatMapping[] = [
    {
      id: 'm1',
      branch_keyword: '北京东城分公司',
      label: '呼家楼',
      category: 'trader',
      enabled: true,
    },
    {
      id: 'm2',
      branch_keyword: '北京呼家楼',
      label: '呼家楼',
      category: 'trader',
      enabled: false,
    },
    {
      id: 'm3',
      branch_keyword: '福州六一中路',
      label: '六一路',
      category: 'trader',
      enabled: true,
    },
  ]

  it('correctly groups flat mappings into entities by label', () => {
    const entities = groupSeatsToEntities(sampleMappings)
    expect(entities).toHaveLength(2)

    const hjl = entities.find((e) => e.name === '呼家楼')
    expect(hjl).toBeDefined()
    expect(hjl?.branches).toHaveLength(2)
    expect(hjl?.branches.map((b) => b.keyword)).toEqual(['北京东城分公司', '北京呼家楼'])
    expect(hjl?.enabled).toBe(true)

    const lyl = entities.find((e) => e.name === '六一路')
    expect(lyl).toBeDefined()
    expect(lyl?.branches).toHaveLength(1)
    expect(lyl?.branches[0].keyword).toBe('福州六一中路')
  })

  it('correctly flattens entities back to flat mappings', () => {
    const entities = groupSeatsToEntities(sampleMappings)
    const flattened = flattenEntitiesToSeats(entities)
    expect(flattened).toHaveLength(3)

    const hjlBranches = flattened.filter((f) => f.label === '呼家楼')
    expect(hjlBranches).toHaveLength(2)
  })

  it('searches seat suggestions based on keywords and pinyin initials', () => {
    const results = searchSeatSuggestions('作手', [])
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name).toBe('作手新一')

    const pinyinResults = searchSeatSuggestions('zsxy', [])
    expect(pinyinResults.some((r) => r.name === '作手新一')).toBe(true)
  })

  it('filters out already existing entity names from suggestions', () => {
    const results = searchSeatSuggestions('作手', ['作手新一'])
    expect(results.some((r) => r.name === '作手新一')).toBe(false)
  })
})
