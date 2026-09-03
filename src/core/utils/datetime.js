/**
 * 时钟时间 HH:mm
 * @param {number|string|Date} [ts]
 * @returns {string}
 */
export function formatClockTime(ts) {
  const d = new Date(Number(ts) || Date.now())
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * 本地日期时间 YYYY-MM-DD HH:mm:ss（日志等）
 * @param {number|string|Date} [ts]
 * @returns {string}
 */
export function formatDateTimeSeconds(ts) {
  const d = new Date(Number(ts) || Date.now())
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = String(d.getFullYear())
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mo}-${dd} ${hh}:${mm}:${ss}`
}

/**
 * 时间线日分隔：今天 / 昨天 / M/D
 * @param {number|string|Date} [ts]
 * @returns {string}
 */
export function formatDayLabel(ts) {
  const t = Number(ts) || Date.now()
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startYesterday = startToday - 86_400_000
  if (t >= startToday) return '今天'
  if (t >= startYesterday) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 生图画廊批次分区标题：今日批次 · HH:mm / 昨天 · HH:mm / M/D · HH:mm
 * @param {number|string|Date} [ts]
 * @returns {string}
 */
export function formatBatchSectionLabel(ts) {
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return '批次'
  const clock = formatClockTime(t)
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startYesterday = startToday - 86_400_000
  if (t >= startToday) return `今日批次 · ${clock}`
  if (t >= startYesterday) return `昨天 · ${clock}`
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} · ${clock}`
}

/**
 * 会话列表相对时间：刚刚 / 昨天 / 周几 / M/D
 * @param {number|string|Date} [ts]
 * @returns {string}
 */
export function formatRelativeSessionTime(ts) {
  const t = Number(ts)
  if (!Number.isFinite(t) || t <= 0) return ''
  const now = Date.now()
  const diff = now - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  const d = new Date(t)
  const today = new Date()
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startYesterday = startToday - 86_400_000
  if (t >= startToday) return formatClockTime(t)
  if (t >= startYesterday) return '昨天'
  const startWeek = startToday - 6 * 86_400_000
  if (t >= startWeek) {
    const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return labels[d.getDay()] || formatClockTime(t)
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}
