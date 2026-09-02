import {describe, expect, it, vi, afterEach} from 'vitest'
import {formatBatchSectionLabel, formatClockTime, formatRelativeSessionTime} from '../datetime'

describe('formatClockTime', () => {
  it('formats HH:mm', () => {
    expect(formatClockTime(new Date(2026, 0, 1, 9, 5).getTime())).toBe('09:05')
    expect(formatClockTime(new Date(2026, 0, 1, 23, 59).getTime())).toBe('23:59')
  })
})

describe('formatBatchSectionLabel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('labels today batch with clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0))
    expect(formatBatchSectionLabel(new Date(2026, 8, 2, 10, 24).getTime())).toBe('今日批次 · 10:24')
  })

  it('labels yesterday', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0))
    expect(formatBatchSectionLabel(new Date(2026, 8, 1, 22, 10).getTime())).toBe('昨天 · 22:10')
  })

  it('returns 批次 for invalid', () => {
    expect(formatBatchSectionLabel(0)).toBe('批次')
  })
})

describe('formatRelativeSessionTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 刚刚 within a minute', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0))
    expect(formatRelativeSessionTime(Date.now() - 20_000)).toBe('刚刚')
  })

  it('returns minutes ago within an hour', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0))
    expect(formatRelativeSessionTime(Date.now() - 5 * 60_000)).toBe('5 分钟前')
  })

  it('returns 昨天 for previous calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0))
    const yesterday = new Date(2026, 8, 1, 18, 30).getTime()
    expect(formatRelativeSessionTime(yesterday)).toBe('昨天')
  })

  it('returns empty for invalid', () => {
    expect(formatRelativeSessionTime(0)).toBe('')
    expect(formatRelativeSessionTime(null)).toBe('')
  })
})
