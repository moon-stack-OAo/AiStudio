import {describe, expect, it} from 'vitest'
import {formatChatContextHint} from '@core/composables/useChatSession'

describe('formatChatContextHint', () => {
  it('full: truncated', () => {
    expect(
      formatChatContextHint(
        {truncated: true, nearLimit: true, totalTurns: 20, maxTurns: 10, keptTurns: 10},
        'full',
      ),
    ).toBe('已裁剪：本次发送最近 10 轮（共 20 轮）')
  })

  it('short: truncated', () => {
    expect(
      formatChatContextHint(
        {truncated: true, nearLimit: true, totalTurns: 20, maxTurns: 10, keptTurns: 10},
        'short',
      ),
    ).toBe('已裁剪：本次发送最近 10 轮（共 20 轮）')
  })

  it('truncated + truncatedByChars', () => {
    expect(
      formatChatContextHint(
        {
          truncated: true,
          truncatedByChars: true,
          nearLimit: true,
          totalTurns: 20,
          maxTurns: 10,
          keptTurns: 8,
        },
        'full',
      ),
    ).toBe('已裁剪：本次发送最近 8 轮（共 20 轮），已按字符预算裁剪')
  })

  it('truncated + truncatedByChars with keptChars/maxChars (full)', () => {
    expect(
      formatChatContextHint(
        {
          truncated: true,
          truncatedByChars: true,
          totalTurns: 20,
          maxTurns: 10,
          keptTurns: 8,
          keptChars: 28000,
          maxChars: 32000,
        },
        'full',
      ),
    ).toBe('已裁剪：本次发送最近 8 轮（共 20 轮），已按字符预算裁剪（28000 / 32000）')
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

  it('short: nearCharLimit', () => {
    expect(
      formatChatContextHint(
        {
          truncated: false,
          nearLimit: false,
          nearCharLimit: true,
          totalTurns: 3,
          maxTurns: 20,
          keptChars: 28000,
          maxChars: 32000,
        },
        'short',
      ),
    ).toBe('接近字符预算：28000 / 32000')
  })

  it('full: nearCharLimit', () => {
    expect(
      formatChatContextHint(
        {
          truncated: false,
          nearLimit: false,
          nearCharLimit: true,
          totalTurns: 3,
          maxTurns: 20,
          keptChars: 28000,
          maxChars: 32000,
        },
        'full',
      ),
    ).toBe('上下文接近字符预算：28000 / 32000，建议新开会话或提高上限')
  })

  it('short: nearLimit + nearCharLimit', () => {
    expect(
      formatChatContextHint(
        {
          truncated: false,
          nearLimit: true,
          nearCharLimit: true,
          totalTurns: 12,
          maxTurns: 20,
          keptChars: 28000,
          maxChars: 32000,
        },
        'short',
      ),
    ).toBe('接近上限：12 / 20 轮 · 28000 / 32000')
  })

  it('full: nearLimit + nearCharLimit', () => {
    expect(
      formatChatContextHint(
        {
          truncated: false,
          nearLimit: true,
          nearCharLimit: true,
          totalTurns: 12,
          maxTurns: 20,
          keptChars: 28000,
          maxChars: 32000,
        },
        'full',
      ),
    ).toBe(
      '上下文接近上限：轮数与字符预算（12 / 20 轮，28000 / 32000），建议新开会话或提高上限',
    )
  })

  it('empty when neither truncated nor near*', () => {
    expect(
      formatChatContextHint(
        {
          truncated: false,
          nearLimit: false,
          nearCharLimit: false,
          totalTurns: 3,
          maxTurns: 10,
        },
        'full',
      ),
    ).toBe('')
  })
})
