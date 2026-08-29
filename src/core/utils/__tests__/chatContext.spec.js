import {describe, it, expect} from 'vitest'
import {countChatTurns, trimChatMessages} from '@core/utils/chatContext'

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
})
