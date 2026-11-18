import type { TrendPoint } from '../types'

export interface ProfileBin {
  priceMin: number
  priceMax: number
  priceCenter: number
  volume: number
  amount: number
  percent: number // 0 to 100
}

export interface VolumeProfileData {
  bins: ProfileBin[]
  pocPrice: number
  pocBin: ProfileBin
  totalVolume: number
  totalAmount: number
  maxBinVolume: number
  vahPrice: number // Value Area High (70% threshold)
  valPrice: number // Value Area Low (70% threshold)
}

export type PocRelation = 'support' | 'resistance' | 'neutral'

/**
 * Compute Volume Profile (日内成交量价格分布 / 筹码峰) from minute trend points.
 */
export function computeVolumeProfile(
  points: TrendPoint[],
  binCount = 30
): VolumeProfileData | null {
  if (!points || points.length < 2) return null

  // 1. Find price extremes
  let minPrice = Infinity
  let maxPrice = -Infinity
  for (const pt of points) {
    if (pt.price > 0) {
      if (pt.price < minPrice) minPrice = pt.price
      if (pt.price > maxPrice) maxPrice = pt.price
    }
  }

  if (minPrice === Infinity || maxPrice === -Infinity) return null

  const priceSpan = maxPrice - minPrice
  const actualBins = priceSpan > 0 ? binCount : 1
  const step = priceSpan > 0 ? priceSpan / actualBins : 0.01

  // 2. Initialize bins
  const bins: ProfileBin[] = []
  for (let i = 0; i < actualBins; i++) {
    const pMin = minPrice + i * step
    const pMax = i === actualBins - 1 ? maxPrice : minPrice + (i + 1) * step
    bins.push({
      priceMin: pMin,
      priceMax: pMax,
      priceCenter: (pMin + pMax) / 2,
      volume: 0,
      amount: 0,
      percent: 0,
    })
  }

  // 3. Accumulate volume and amount into bins using minute-by-minute deltas
  let totalVolume = 0
  let totalAmount = 0

  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    if (pt.price <= 0) continue

    let volDelta = 0
    let amtDelta = 0
    if (i === 0) {
      volDelta = pt.cumVolume
      amtDelta = pt.cumAmount
    } else {
      volDelta = Math.max(0, pt.cumVolume - points[i - 1].cumVolume)
      amtDelta = Math.max(0, pt.cumAmount - points[i - 1].cumAmount)
    }

    if (volDelta <= 0 && amtDelta <= 0) continue

    totalVolume += volDelta
    totalAmount += amtDelta

    let binIdx = priceSpan > 0 ? Math.floor((pt.price - minPrice) / step) : 0
    if (binIdx < 0) binIdx = 0
    if (binIdx >= actualBins) binIdx = actualBins - 1

    bins[binIdx].volume += volDelta
    bins[binIdx].amount += amtDelta
  }

  if (totalVolume <= 0) return null

  // 4. Find POC (Point of Control) and compute percentages
  let maxBinVolume = 0
  let pocIdx = 0
  for (let i = 0; i < bins.length; i++) {
    bins[i].percent = (bins[i].volume / totalVolume) * 100
    if (bins[i].volume > maxBinVolume) {
      maxBinVolume = bins[i].volume
      pocIdx = i
    }
  }

  const pocBin = bins[pocIdx]
  const pocPrice = pocBin.priceCenter

  // 5. Compute Value Area (VA: 70% volume range around POC)
  const targetVaVolume = totalVolume * 0.7
  let currentVaVolume = pocBin.volume
  let upIdx = pocIdx
  let downIdx = pocIdx

  while (currentVaVolume < targetVaVolume && (upIdx < bins.length - 1 || downIdx > 0)) {
    const nextUpVol = upIdx < bins.length - 1 ? bins[upIdx + 1].volume : 0
    const nextDownVol = downIdx > 0 ? bins[downIdx - 1].volume : 0

    if (nextUpVol >= nextDownVol && upIdx < bins.length - 1) {
      upIdx++
      currentVaVolume += bins[upIdx].volume
    } else if (downIdx > 0) {
      downIdx--
      currentVaVolume += bins[downIdx].volume
    } else {
      upIdx++
      currentVaVolume += bins[upIdx].volume
    }
  }

  const vahPrice = bins[upIdx].priceMax
  const valPrice = bins[downIdx].priceMin

  return {
    bins,
    pocPrice,
    pocBin,
    totalVolume,
    totalAmount,
    maxBinVolume,
    vahPrice,
    valPrice,
  }
}

/**
 * Locate which profile bin contains the specified price.
 */
export function findProfileBinAtPrice(
  profile: VolumeProfileData | null | undefined,
  price: number
): ProfileBin | null {
  if (!profile || !profile.bins.length || price <= 0) return null
  const minPrice = profile.bins[0].priceMin
  const maxPrice = profile.bins[profile.bins.length - 1].priceMax
  const priceSpan = maxPrice - minPrice
  if (priceSpan <= 0) return profile.bins[0]
  const step = priceSpan / profile.bins.length
  let idx = Math.floor((price - minPrice) / step)
  if (idx < 0) idx = 0
  if (idx >= profile.bins.length) idx = profile.bins.length - 1
  return profile.bins[idx]
}

/**
 * Determine dynamic support or resistance relationship of POC against current price.
 */
export function getPocRelation(
  currentPrice: number,
  pocPrice: number
): { relation: PocRelation; label: string; diffPct: number } {
  if (currentPrice <= 0 || pocPrice <= 0) {
    return { relation: 'neutral', label: 'POC', diffPct: 0 }
  }
  const diffPct = ((currentPrice - pocPrice) / pocPrice) * 100
  if (diffPct > 0.2) {
    return { relation: 'support', label: '强支撑', diffPct }
  } else if (diffPct < -0.2) {
    return { relation: 'resistance', label: '强压制', diffPct }
  }
  return { relation: 'neutral', label: '主力重心', diffPct }
}
