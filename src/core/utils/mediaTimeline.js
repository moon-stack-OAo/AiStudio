import {formatClockTime, formatDayLabel} from '@core/utils/datetime'

/**
 * 按日分隔插入 day 行的时间线 rows（Android 气泡时间线）。
 * @param {Array<{id: string, createdAt?: number}>} items
 * @returns {Array<{kind: 'day'|'item', id: string, label?: string, item?: object}>}
 */
export function buildDayGroupedTimelineRows(items) {
  const rows = []
  let lastDay = null
  for (const item of items || []) {
    const label = formatDayLabel(item?.createdAt)
    if (label !== lastDay) {
      rows.push({kind: 'day', id: `day-${label}-${item.id}`, label})
      lastDay = label
    }
    rows.push({kind: 'item', id: item.id, item})
  }
  return rows
}

/**
 * 气泡 meta 片段：模式 · 时间 · 参数摘要拆分
 * @param {{ modeLabel: string, createdAt?: number|string|Date, summary?: string }} opts
 * @returns {string[]}
 */
export function buildBubbleMetaParts({modeLabel, createdAt, summary}) {
  const parts = [modeLabel, formatClockTime(createdAt)]
  if (summary) {
    for (const part of String(summary).split(' · ')) {
      if (part) parts.push(part)
    }
  }
  return parts
}

/**
 * 卡片头 meta：时间 · 参数摘要
 * @param {{ createdAt?: number|string|Date, summary?: string }} opts
 * @returns {string}
 */
export function buildCardHdMeta({createdAt, summary}) {
  const parts = [formatClockTime(createdAt)]
  if (summary) parts.push(summary)
  return parts.join(' · ')
}
