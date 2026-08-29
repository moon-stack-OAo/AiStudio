import {describe, it, expect} from 'vitest'
import {countChatTurns, estimateChatChars, trimChatMessages} from '@core/utils/chatContext'

describe('countChatTurns', () => {
  it('按 user 消息条数计轮', () => {
    expect(countChatTurns([])).toBe(0)
    expect(
      countChatTurns([
        {role: 'system', content: 's'},
        {role: 'user', content: 'u1'},
        {role: 'assistant', content: 'a1'},
        {role: 'user', content: 'u2'},
      ]),
    ).toBe(2)
  })
})

describe('estimateChatChars', () => {
  it('累加字符串 content 长度', () => {
    expect(
      estimateChatChars([
        {role: 'user', content: 'ab'},
        {role: 'assistant', content: 'cde'},
      ]),
    ).toBe(5)
  })

  it('非字符串 content 用 JSON.stringify', () => {
    expect(estimateChatChars([{role: 'user', content: {a: 1}}])).toBe(JSON.stringify({a: 1}).length)
  })
})

describe('trimChatMessages', () => {
  const msgs = [
    {role: 'system', content: 'sys'},
    {role: 'user', content: 'u1'},
    {role: 'assistant', content: 'a1'},
    {role: 'user', content: 'u2'},
    {role: 'assistant', content: 'a2'},
    {role: 'user', content: 'u3'},
    {role: 'assistant', content: 'a3'},
  ]

  it('未超限不截断', () => {
    const result = trimChatMessages(msgs, {maxTurns: 5})
    expect(result.truncated).toBe(false)
    expect(result.droppedTurns).toBe(0)
    expect(result.messages).toEqual(msgs)
    expect(result.totalTurns).toBe(3)
    expect(result.keptTurns).toBe(3)
    expect(result.truncatedByChars).toBe(false)
  })

  it('超限保留 system + 最近 N 轮', () => {
    const result = trimChatMessages(msgs, {maxTurns: 2})
    expect(result.truncated).toBe(true)
    expect(result.droppedTurns).toBe(1)
    expect(result.keptTurns).toBe(2)
    expect(result.messages[0]).toEqual({role: 'system', content: 'sys'})
    expect(result.messages.map((m) => m.content)).toEqual(['sys', 'u2', 'a2', 'u3', 'a3'])
    expect(result.nearLimit).toBe(true)
  })

  it('nearLimit：接近上限时为 true', () => {
    // WARN_RATIO=0.8，maxTurns=5 → ceil(4)=4，3 轮未到，4 轮触发
    const fourTurns = [
      {role: 'user', content: 'u1'},
      {role: 'assistant', content: 'a1'},
      {role: 'user', content: 'u2'},
      {role: 'assistant', content: 'a2'},
      {role: 'user', content: 'u3'},
      {role: 'assistant', content: 'a3'},
      {role: 'user', content: 'u4'},
      {role: 'assistant', content: 'a4'},
    ]
    expect(trimChatMessages(fourTurns, {maxTurns: 5}).nearLimit).toBe(true)
    expect(trimChatMessages(fourTurns.slice(0, 6), {maxTurns: 5}).nearLimit).toBe(false)
  })

  it('enabled: false 不截断', () => {
    const result = trimChatMessages(msgs, {enabled: false, maxTurns: 1})
    expect(result.truncated).toBe(false)
    expect(result.droppedTurns).toBe(0)
    expect(result.messages).toEqual(msgs)
    expect(result.nearLimit).toBe(false)
  })

  it('字符预算：从最旧轮丢弃直到不超过上限', () => {
    const long = [
      {role: 'system', content: 'S'},
      {role: 'user', content: 'AAAA'},
      {role: 'assistant', content: 'BBBB'},
      {role: 'user', content: 'CCCC'},
      {role: 'assistant', content: 'DDDD'},
      {role: 'user', content: 'EEEE'},
      {role: 'assistant', content: 'FFFF'},
    ]
    // 全量含 system：1+4*6=25；限制 17 → 应丢掉第一轮后剩 sys+2轮=1+16=17
    const result = trimChatMessages(long, {
      enabled: false,
      maxTurns: 10,
      maxCharsEnabled: true,
      maxChars: 17,
    })
    expect(result.truncatedByChars).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.keptTurns).toBe(2)
    expect(result.messages.map((m) => m.content)).toEqual(['S', 'CCCC', 'DDDD', 'EEEE', 'FFFF'])
    expect(result.keptChars).toBe(17)
    expect(result.totalChars).toBeGreaterThan(17)
  })

  it('字符预算：先按轮再按字符', () => {
    const many = []
    for (let i = 1; i <= 5; i += 1) {
      many.push({role: 'user', content: `U${i}xxx`})
      many.push({role: 'assistant', content: `A${i}xxx`})
    }
    const result = trimChatMessages(many, {
      enabled: true,
      maxTurns: 3,
      maxCharsEnabled: true,
      maxChars: 20,
    })
    expect(result.keptTurns).toBeLessThanOrEqual(3)
    expect(result.keptChars).toBeLessThanOrEqual(20)
    expect(result.truncated || result.truncatedByChars).toBe(true)
  })

  it('字符预算关闭时不按字符裁剪', () => {
    const result = trimChatMessages(msgs, {
      maxTurns: 5,
      maxCharsEnabled: false,
      maxChars: 1,
    })
    expect(result.truncatedByChars).toBe(false)
    expect(result.messages).toEqual(msgs)
  })
})
