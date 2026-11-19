import { describe, expect, it } from 'vitest'
import { resolveSeatLabel, searchBranchDictionary } from '../dragon_tiger/seatDict'

describe('SeatsTab & resolveSeatLabel', () => {
  it('resolves famous trader labels from representative branches', () => {
    const hjl = resolveSeatLabel('中信建投证券股份有限公司北京东城分公司')
    expect(hjl).not.toBeNull()
    expect(hjl?.label).toBe('呼家楼')
    expect(hjl?.category).toBe('trader')

    const lyl = resolveSeatLabel('华泰证券股份有限公司福州六一中路证券营业部')
    expect(lyl).not.toBeNull()
    expect(lyl?.label).toBe('六一路')

    const inst = resolveSeatLabel('机构专用')
    expect(inst).not.toBeNull()
    expect(inst?.label).toBe('机构专用')
    expect(inst?.category).toBe('institution')

    const yg = resolveSeatLabel('东吴证券股份有限公司苏州石路证券营业部')
    expect(yg?.label).toBe('96余哥')
    expect(yg?.category).toBe('trader')

    const ygShort = resolveSeatLabel('东吴证券苏州石路')
    expect(ygShort?.label).toBe('96余哥')

    const xfs = resolveSeatLabel('东莞证券股份有限公司南京分公司')
    expect(xfs?.label).toBe('小方神')

    const kb = resolveSeatLabel('华鑫证券上海徐汇区瑞平路')
    expect(kb?.label).toBe('92科比')

    const zmzMerge = resolveSeatLabel('国泰海通证券长宁区江苏路')
    expect(zmzMerge?.label).toBe('章盟主')
  })

  it('searches branch dictionary by pinyin and keyword', () => {
    const resHjl = searchBranchDictionary('hjl')
    expect(resHjl.length).toBeGreaterThan(0)
    expect(resHjl.some((r) => r.traderLabel === '呼家楼')).toBe(true)

    const resLasa = searchBranchDictionary('拉萨')
    expect(resLasa.length).toBeGreaterThan(0)
    expect(resLasa.some((r) => r.branchName.includes('拉萨'))).toBe(true)
  })
})
