//! Badge text utility functions for deduplicating and combining technical state and trading action.
//!
//! Complies with AGENTS.md §11 (isolated module, <=300 lines).

/**
 * Combines a technical prefix (pattern/position) and an operational action into
 * a standardized "[Prefix] · [Action]" badge text, guaranteeing that the prefix
 * and action never duplicate identical words or meanings.
 *
 * @param prefix Technical pattern/location prefix, e.g. "❄️ 承压MA20", "▲ 均线多头", "▲ 稳步多头"
 * @param action Operational tactical action, e.g. "逢高止盈", "顺势做多", "超跌反弹"
 * @param fallbackAction Fallback operational action if action duplicates prefix
 */
export function combineBadgeText(
  prefix: string,
  action: string,
  fallbackAction?: string
): string {
  const p = prefix.trim()
  const a = action.replace(/[【】]/g, '').trim()
  if (!p) return a
  if (!a) return p

  // Extract raw text without leading icons (▲, ▼, ⚡, ★, ●, ❄️, 🔥, etc.)
  const rawPrefix = p.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D▲▼⚡★●❄️🔥\s]+/u, '').trim()

  // Check if prefix and action are identical or heavily overlap
  const isDuplicated =
    rawPrefix === a ||
    (rawPrefix.length >= 2 && a.length >= 2 && (rawPrefix.includes(a) || a.includes(rawPrefix)))

  if (isDuplicated) {
    if (fallbackAction) {
      const cleanFb = fallbackAction.replace(/[【】]/g, '').trim()
      if (cleanFb !== a && !rawPrefix.includes(cleanFb) && !cleanFb.includes(rawPrefix)) {
        return `${p} · ${cleanFb}`
      }
    }

    // Derive contextual complementary actions to prevent repetitive wording
    if (a.includes('止盈') || rawPrefix.includes('止盈')) return `${p} · 分批落袋`
    if (a.includes('反弹') || rawPrefix.includes('反弹')) return `${p} · 适度博弈`
    if (a.includes('支撑') || rawPrefix.includes('支撑')) return `${p} · 观察企稳`
    if (a.includes('做多') || rawPrefix.includes('做多')) return `${p} · 顺势跟进`
    if (a.includes('持股') || rawPrefix.includes('持股')) return `${p} · 持股待涨`
    if (a.includes('止损') || rawPrefix.includes('止损')) return `${p} · 坚决离场`
    if (a.includes('减仓') || rawPrefix.includes('减仓')) return `${p} · 逢高控仓`
    if (a.includes('防守') || rawPrefix.includes('防守')) return `${p} · 谨慎观望`
    return `${p} · 分步应对`
  }

  return `${p} · ${a}`
}
