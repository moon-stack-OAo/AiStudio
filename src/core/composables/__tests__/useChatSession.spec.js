import {describe, expect, it} from 'vitest'
import {formatChatContextHint} from '@core/composables/useChatSession'

describe('formatChatContextHint', () => {
  it('full: truncated', () => {
    expect(
      formatChatContextHint(
        {truncated: true, nearLimit: true, totalTurns: 20, maxTurns: 10},
        'full',
      ),
    ).toBe('已启用上下文裁剪：保留最近 10 轮（当前 20 轮）')
  })

  it('short: truncated', () => {
    expect(
      formatChatContextHint(
        {truncated: true, nearLimit: true, totalTurns: 20, maxTurns: 10},
        'short',
      ),
    ).toBe('已裁剪：保留最近 10 轮（当前 20 轮）')
  })

  it('full: nearLimit', () => {
    expect(
      formatChatContextHint(
        {truncated: false, nearLimit: true, totalTurns: 9, maxTurns: 10},
        'full',
      ),
    ).toBe('上下文接近上限：9 / 10 轮，建议新开会话或提高上限')
  })

  it('short: nearLimit', () => {
    expect(
      formatChatContextHint(
        {truncated: false, nearLimit: true, totalTurns: 9, maxTurns: 10},
        'short',
      ),
    ).toBe('接近上限：9 / 10 轮')
  })

  it('empty when neither truncated nor nearLimit', () => {
    expect(
      formatChatContextHint(
        {truncated: false, nearLimit: false, totalTurns: 3, maxTurns: 10},
        'full',
      ),
    ).toBe('')
  })
})
