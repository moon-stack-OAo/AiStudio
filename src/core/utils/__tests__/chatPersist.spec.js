import {describe, expect, it} from 'vitest'
import {
  capChatSessionCount,
  estimateJsonChars,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_MESSAGES_PER_SESSION,
  MAX_CHAT_SESSIONS,
  prepareChatPersistPayload,
  sanitizeChatMessage,
  sanitizeChatSession,
  trimChatPayloadToBudget,
} from '../chatPersist.js'

function msg(id, content, role = 'user') {
  return {id, role, content, createdAt: 1}
}

function session(id, updatedAt, messages = []) {
  return {id, title: id, type: 'chat', createdAt: updatedAt, updatedAt, messages, overrides: {}}
}

describe('chatPersist', () => {
  it('sanitizeChatMessage 截断超长 content', () => {
    const long = 'x'.repeat(MAX_CHAT_MESSAGE_CHARS + 50)
    const out = sanitizeChatMessage(msg('m1', long))
    expect(out.content.length).toBeLessThan(long.length)
    expect(out.content).toContain('本地已截断')
    expect(sanitizeChatMessage(msg('m2', 'short')).content).toBe('short')
  })

  it('sanitizeChatSession 保留最近 N 条消息', () => {
    const messages = Array.from({length: MAX_CHAT_MESSAGES_PER_SESSION + 5}, (_, i) =>
      msg(`m${i}`, `c${i}`),
    )
    const out = sanitizeChatSession(session('s1', 1, messages))
    expect(out.messages).toHaveLength(MAX_CHAT_MESSAGES_PER_SESSION)
    expect(out.messages[0].id).toBe('m5')
    expect(out.messages.at(-1).id).toBe(`m${MAX_CHAT_MESSAGES_PER_SESSION + 4}`)
  })

  it('capChatSessionCount 优先保留活跃与较新会话', () => {
    const sessions = Array.from({length: MAX_CHAT_SESSIONS + 3}, (_, i) =>
      session(`s${i}`, i + 1, [msg(`m${i}`, 'hi')]),
    )
    const activeId = 's0'
    const out = capChatSessionCount(sessions, activeId, MAX_CHAT_SESSIONS)
    expect(out).toHaveLength(MAX_CHAT_SESSIONS)
    expect(out.some((s) => s.id === activeId)).toBe(true)
    expect(out.some((s) => s.id === `s${MAX_CHAT_SESSIONS + 2}`)).toBe(true)
  })

  it('trimChatPayloadToBudget 超限时丢最旧非活跃会话消息', () => {
    const big = 'y'.repeat(8000)
    const sessions = [
      session(
        'old',
        1,
        Array.from({length: 20}, (_, i) => msg(`o${i}`, big)),
      ),
      session('active', 100, [msg('a1', 'keep-me'), msg('a2', 'keep-2')]),
    ]
    const {payload, trimmed, droppedMessages} = trimChatPayloadToBudget(
      {sessions, activeId: 'active'},
      20_000,
    )
    expect(trimmed).toBe(true)
    expect(droppedMessages).toBeGreaterThan(0)
    expect(
      payload.sessions
        .find((s) => s.id === 'active')
        ?.messages.some((m) => m.content === 'keep-me'),
    ).toBe(true)
    expect(estimateJsonChars(payload)).toBeLessThanOrEqual(20_000)
  })

  it('prepareChatPersistPayload 综合裁剪并可保持小载荷不变', () => {
    const small = prepareChatPersistPayload({
      sessions: [session('s1', 1, [msg('m1', 'hello')])],
      activeId: 's1',
    })
    expect(small.trimmed).toBe(false)
    expect(small.payload.sessions[0].messages[0].content).toBe('hello')

    const many = Array.from({length: MAX_CHAT_SESSIONS + 2}, (_, i) =>
      session(`s${i}`, i, [msg(`m${i}`, 'x')]),
    )
    const capped = prepareChatPersistPayload({sessions: many, activeId: 's0'})
    expect(capped.trimmed).toBe(true)
    expect(capped.payload.sessions.length).toBeLessThanOrEqual(MAX_CHAT_SESSIONS)
  })
})
