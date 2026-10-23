import { describe, expect, it } from 'vitest'
import { combineBadgeText } from './badgeUtils'

describe('combineBadgeText', () => {
  it('combines non-overlapping prefix and action cleanly', () => {
    expect(combineBadgeText('❄️ 承压MA20', '逢高止盈')).toBe('❄️ 承压MA20 · 逢高止盈')
    expect(combineBadgeText('▲ 均线多头', '顺势持股')).toBe('▲ 均线多头 · 顺势持股')
    expect(combineBadgeText('▲ 回踩MA5', '考验支撑')).toBe('▲ 回踩MA5 · 考验支撑')
    expect(combineBadgeText('❄️ 弱势触底', '超跌反弹')).toBe('❄️ 弱势触底 · 超跌反弹')
  })

  it('strips bracket wrappers from action', () => {
    expect(combineBadgeText('▲ 站上MA20', '【顺势做多】')).toBe('▲ 站上MA20 · 顺势做多')
  })

  it('prevents exact duplicates between prefix and action', () => {
    // When prefix and action are identical, e.g. "⚡ 逢高止盈" and "逢高止盈"
    expect(combineBadgeText('⚡ 逢高止盈', '逢高止盈')).toBe('⚡ 逢高止盈 · 分批落袋')
    expect(combineBadgeText('▲ 考验支撑', '考验支撑')).toBe('▲ 考验支撑 · 观察企稳')
    expect(combineBadgeText('★ 超跌反弹', '超跌反弹')).toBe('★ 超跌反弹 · 适度博弈')
    expect(combineBadgeText('❄️ 严格止损', '严格止损')).toBe('❄️ 严格止损 · 坚决离场')
  })

  it('uses fallbackAction if available and non-overlapping', () => {
    expect(combineBadgeText('▲ 考验支撑', '考验支撑', '蓄势观察')).toBe('▲ 考验支撑 · 蓄势观察')
    expect(combineBadgeText('★ 超跌反弹', '超跌反弹', '低吸布局')).toBe('★ 超跌反弹 · 低吸布局')
  })

  it('handles edge cases gracefully', () => {
    expect(combineBadgeText('', '逢高止盈')).toBe('逢高止盈')
    expect(combineBadgeText('❄️ 承压MA20', '')).toBe('❄️ 承压MA20')
  })
})
