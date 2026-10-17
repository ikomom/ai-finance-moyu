export interface MarketStatus {
  status: 'open' | 'closed' | 'pre' | 'break'
  label: string
  badgeClass: string
  hoursText: string
}

/**
 * 计算全球主要股指在当前自然时间的开闭市状态与交易时段 (支持夏令时/冬令时自动转换).
 */
export function getGlobalMarketStatus(code: string, date = new Date()): MarketStatus {
  let timeZone = 'UTC'
  let openH = 9
  let openM = 30
  let closeH = 16
  let closeM = 0
  let hasLunchBreak = false
  let lunchStartH = 12
  let lunchStartM = 0
  let lunchEndH = 13
  let lunchEndM = 0
  let preMarketH = 0
  let preMarketM = 0
  let hoursText = ''

  if (code.startsWith('us')) {
    timeZone = 'America/New_York'
    openH = 9
    openM = 30
    closeH = 16
    closeM = 0
    preMarketH = 4
    preMarketM = 0
    hoursText = '美东 09:30-16:00'
  } else if (code.startsWith('hk')) {
    timeZone = 'Asia/Hong_Kong'
    openH = 9
    openM = 30
    closeH = 16
    closeM = 10
    preMarketH = 9
    preMarketM = 0
    hasLunchBreak = true
    lunchStartH = 12
    lunchStartM = 0
    lunchEndH = 13
    lunchEndM = 0
    hoursText = '港股 09:30-16:00'
  } else if (code === 'gzN225') {
    timeZone = 'Asia/Tokyo'
    openH = 9
    openM = 0
    closeH = 15
    closeM = 30
    preMarketH = 8
    preMarketM = 30
    hasLunchBreak = true
    lunchStartH = 11
    lunchStartM = 30
    lunchEndH = 12
    lunchEndM = 30
    hoursText = '东京 09:00-15:30 (北京 08:00-14:30)'
  } else if (code === 'gzKS11') {
    timeZone = 'Asia/Seoul'
    openH = 9
    openM = 0
    closeH = 15
    closeM = 30
    preMarketH = 8
    preMarketM = 30
    hoursText = '首尔 09:00-15:30 (北京 08:00-14:30)'
  } else if (code === 'gzFTSE') {
    timeZone = 'Europe/London'
    openH = 8
    openM = 0
    closeH = 16
    closeM = 30
    preMarketH = 7
    preMarketM = 50
    hoursText = '伦敦 08:00-16:30 (北京 15:00-23:30)'
  }

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
    }).formatToParts(date)

    let weekday = ''
    let hour = 0
    let minute = 0
    for (const p of parts) {
      if (p.type === 'weekday') weekday = p.value
      else if (p.type === 'hour') hour = parseInt(p.value, 10)
      else if (p.type === 'minute') minute = parseInt(p.value, 10)
    }

    if (hour === 24) hour = 0

    const currentMinutes = hour * 60 + minute
    const isWeekend = weekday === 'Sat' || weekday === 'Sun'

    if (isWeekend) {
      return {
        status: 'closed',
        label: '周末休市',
        badgeClass: 'status-closed',
        hoursText,
      }
    }

    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM
    const preMinutes = preMarketH * 60 + preMarketM

    if (hasLunchBreak) {
      const lunchStart = lunchStartH * 60 + lunchStartM
      const lunchEnd = lunchEndH * 60 + lunchEndM
      if (currentMinutes >= openMinutes && currentMinutes < lunchStart) {
        return { status: 'open', label: '交易中', badgeClass: 'status-open', hoursText }
      }
      if (currentMinutes >= lunchStart && currentMinutes < lunchEnd) {
        return { status: 'break', label: '午休', badgeClass: 'status-break', hoursText }
      }
      if (currentMinutes >= lunchEnd && currentMinutes < closeMinutes) {
        return { status: 'open', label: '交易中', badgeClass: 'status-open', hoursText }
      }
    } else {
      if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
        return { status: 'open', label: '交易中', badgeClass: 'status-open', hoursText }
      }
    }

    if (currentMinutes >= preMinutes && currentMinutes < openMinutes) {
      return { status: 'pre', label: '盘前', badgeClass: 'status-pre', hoursText }
    }

    if (code.startsWith('us') && currentMinutes >= closeMinutes && currentMinutes < 20 * 60) {
      return { status: 'pre', label: '盘后', badgeClass: 'status-pre', hoursText }
    }

    return { status: 'closed', label: '已收盘', badgeClass: 'status-closed', hoursText }
  } catch {
    return { status: 'closed', label: '已收盘', badgeClass: 'status-closed', hoursText }
  }
}
