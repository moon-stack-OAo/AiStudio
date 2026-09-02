import {describe, expect, it, vi, afterEach} from 'vitest'
import {
  buildBubbleMetaParts,
  buildCardHdMeta,
  buildDayGroupedTimelineRows,
} from '../mediaTimeline'

describe('buildDayGroupedTimelineRows', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('inserts day separators between calendar days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 2, 12, 0, 0))
    const today = new Date(2026, 8, 2, 9, 0).getTime()
    const yesterday = new Date(2026, 8, 1, 18, 0).getTime()
    const rows = buildDayGroupedTimelineRows([
      {id: 'a', createdAt: yesterday},
      {id: 'b', createdAt: today},
      {id: 'c', createdAt: today},
    ])
    expect(rows.map((r) => r.kind)).toEqual(['day', 'item', 'day', 'item', 'item'])
    expect(rows[0].label).toBe('昨天')
    expect(rows[2].label).toBe('今天')
    expect(rows[1].item.id).toBe('a')
  })
})

describe('buildBubbleMetaParts', () => {
  it('splits summary and prepends mode + clock', () => {
    const parts = buildBubbleMetaParts({
      modeLabel: '文生图',
      createdAt: new Date(2026, 0, 1, 9, 5).getTime(),
      summary: '1024×1024 · 高清',
    })
    expect(parts).toEqual(['文生图', '09:05', '1024×1024', '高清'])
  })
})

describe('buildCardHdMeta', () => {
  it('joins clock and summary', () => {
    expect(
      buildCardHdMeta({
        createdAt: new Date(2026, 0, 1, 23, 59).getTime(),
        summary: '16:9',
      }),
    ).toBe('23:59 · 16:9')
  })
})
