export function fmtMoney(amt: number, withSign = true): string {
  if (amt == null || !Number.isFinite(amt)) return '--'
  const sign = withSign ? (amt > 0 ? '+' : amt < 0 ? '-' : '') : ''
  const abs = Math.abs(amt)
  if (abs >= 1e8) return `${sign}${(abs / 1e8).toFixed(2)}亿`
  if (abs >= 1e4) return `${sign}${(abs / 1e4).toFixed(0)}万`
  return `${sign}${abs.toFixed(0)}`
}

export function trendMoneyClass(amt: number): 'up' | 'down' | 'flat' {
  if (amt > 0) return 'up'
  if (amt < 0) return 'down'
  return 'flat'
}

/** Clean up verbose corporate entity suffixes to maximize space for branch city and road name. */
export function cleanBranchName(name: string): string {
  if (!name) return '--'
  if (name === '机构专用' || name === '深股通专用' || name === '沪股通专用') return name
  return name
    .replace(/^中国/, '')
    .replace(/股份有限公司|有限责任公司/g, '')
    .replace(/证券营业部|营业部/g, '')
    .replace(/^东方财富证券/, '东财')
    .replace(/证券(分公司|路|街|桥|道|门|支)/g, '$1')
    .trim()
}

/** Determine whether this report is a 3-day cumulative or 1-day list. */
export function getLhbPeriodType(reason: string): '3day' | '1day' {
  if (!reason) return '1day'
  return reason.includes('连续三个交易日') || reason.includes('3日') ? '3day' : '1day'
}

/** Calculate days elapsed since trade_date (to flag stale historical records). */
export function getDaysDiff(tradeDate: string): number {
  if (!tradeDate) return 0
  const d = new Date(tradeDate + 'T00:00:00')
  const now = new Date()
  const diffTime = now.getTime() - d.getTime()
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))
}

/** Shorten verbose official exchange explanation strings to concise trader terminology. */
export function shortenLhbReason(reason: string): string {
  if (!reason) return '龙虎榜披露'
  let s = reason
    .replace(/^非(?:ST、\*ST和|ST和|ST、)?S?证券/, '')
    .replace(/的前\d+只证券$/, '')
    .replace(/的证券$/, '')
    .trim()
  s = s
    .replace(/连续三个交易日内收盘价格涨幅偏离值累计达到(\d+%)?/, '3日涨幅偏离达$1')
    .replace(/连续三个交易日内收盘价格跌幅偏离值累计达到(\d+%)?/, '3日跌幅偏离达$1')
    .replace(/连续三个交易日内收盘价涨幅偏离值累计达到(\d+%)?/, '3日涨幅偏离达$1')
    .replace(/连续三个交易日内收盘价跌幅偏离值累计达到(\d+%)?/, '3日跌幅偏离达$1')
    .replace(/日收盘价涨幅偏离值达到(\d+%)?/, '日涨幅偏离达$1')
    .replace(/日收盘价跌幅偏离值达到(\d+%)?/, '日跌幅偏离达$1')
    .replace(/日涨幅偏离值达到(\d+%)?/, '日涨幅偏离达$1')
    .replace(/日跌幅偏离值达到(\d+%)?/, '日跌幅偏离达$1')
    .replace(/日换手率达到(\d+%)?/, '日换手率达$1')
    .replace(/日振幅值达到(\d+%)?/, '日振幅达$1')
    .replace(/无价格涨跌幅限制/, '无涨跌幅限制')
  return s.length > 18 ? s.slice(0, 16) + '…' : s
}

/** Safely align date to the nearest preceding trade day, immune to UTC timezone drift */
export function alignToTradeDay(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return dateStr
  const day = d.getDay()
  if (day === 0) d.setDate(d.getDate() - 2)
  else if (day === 6) d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dt = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dt}`
}

/** Check if a seat row matches the highlight target branch or trader name */
export function isSeatHighlighted(
  branchName: string,
  highlightBranch?: string,
  tagLabel?: string
): boolean {
  const h = highlightBranch?.trim()
  if (!h) return false
  if (branchName.includes(h) || h.includes(branchName)) return true
  if (tagLabel && (h.includes(tagLabel) || tagLabel.includes(h))) return true
  return false
}

export interface PairedSeatMeta {
  displayName: string
  pairId?: string
  isT: boolean
  totalBuy?: number
  totalSell?: number
  netAmount: number
}

const CIRCLE_NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

export function analyzeSeatPairs(
  buyers: Array<{ branch_name: string; buy_amount: number; sell_amount: number; net_amount: number }>,
  sellers: Array<{ branch_name: string; buy_amount: number; sell_amount: number; net_amount: number }>
): {
  buyerMetas: PairedSeatMeta[]
  sellerMetas: PairedSeatMeta[]
} {
  const buyerMetas: PairedSeatMeta[] = buyers.map((b) => ({
    displayName: cleanBranchName(b.branch_name),
    isT: false,
    netAmount: b.net_amount,
  }))
  const sellerMetas: PairedSeatMeta[] = sellers.map((s) => ({
    displayName: cleanBranchName(s.branch_name),
    isT: false,
    netAmount: s.net_amount,
  }))

  const matchedSellerIndices = new Set<number>()
  let instPairCounter = 0

  // 1. 优先匹配具名营业部与外资（深股通/沪股通）
  buyers.forEach((b, bIdx) => {
    if (b.branch_name === '机构专用') return
    const sIdx = sellers.findIndex(
      (s, idx) => !matchedSellerIndices.has(idx) && s.branch_name === b.branch_name
    )
    if (sIdx >= 0) {
      matchedSellerIndices.add(sIdx)
      const pId = `pair_${b.branch_name}`
      const clean = cleanBranchName(b.branch_name)
      const totalBuy = b.buy_amount > 0 ? b.buy_amount : Math.max(0, b.net_amount)
      const totalSell = sellers[sIdx].sell_amount > 0 ? sellers[sIdx].sell_amount : Math.abs(sellers[sIdx].net_amount)
      buyerMetas[bIdx] = {
        displayName: clean,
        pairId: pId,
        isT: true,
        totalBuy,
        totalSell,
        netAmount: b.net_amount,
      }
      sellerMetas[sIdx] = {
        displayName: clean,
        pairId: pId,
        isT: true,
        totalBuy,
        totalSell,
        netAmount: sellers[sIdx].net_amount,
      }
    }
  })

  // 2. 匹配同名「机构专用」（通过 net_amount 相等配对）
  buyers.forEach((b, bIdx) => {
    if (b.branch_name !== '机构专用' || buyerMetas[bIdx].isT) return
    const sIdx = sellers.findIndex(
      (s, idx) =>
        !matchedSellerIndices.has(idx) &&
        s.branch_name === '机构专用' &&
        Math.abs(s.net_amount - b.net_amount) < 500
    )
    if (sIdx >= 0) {
      matchedSellerIndices.add(sIdx)
      const numLabel = CIRCLE_NUMS[instPairCounter] || `(${instPairCounter + 1})`
      instPairCounter++
      const pId = `pair_inst_${instPairCounter}`
      const nameWithNum = `机构专用 ${numLabel}`
      const totalBuy = b.buy_amount > 0 ? b.buy_amount : Math.max(0, b.net_amount)
      const totalSell = sellers[sIdx].sell_amount > 0 ? sellers[sIdx].sell_amount : Math.abs(sellers[sIdx].net_amount)

      buyerMetas[bIdx] = {
        displayName: nameWithNum,
        pairId: pId,
        isT: true,
        totalBuy,
        totalSell,
        netAmount: b.net_amount,
      }
      sellerMetas[sIdx] = {
        displayName: nameWithNum,
        pairId: pId,
        isT: true,
        totalBuy,
        totalSell,
        netAmount: sellers[sIdx].net_amount,
      }
    }
  })

  return { buyerMetas, sellerMetas }
}

