import {describe, expect, it} from 'vitest'
import {estimateJsonChars} from '../chatPersist.js'
import {
  MAX_MEDIA_ITEMS_PER_SESSION,
  MAX_MEDIA_SESSIONS,
  capMediaSessionCount,
  collectDroppedMediaItems,
  prepareMediaPersistPayload,
  sanitizeMediaSession,
  trimMediaPayloadToBudget,
} from '../mediaPersist.js'

function item(id, extra = {}) {
  return {id, status: 'done', createdAt: 1, prompt: id, ...extra}
}

function session(id, updatedAt, items = []) {
  return {id, title: id, type: 'image', createdAt: updatedAt, updatedAt, items}
}

describe('mediaPersist', () => {
  it('sanitizeMediaSession 保留最近 N 条并调用 sanitizeItem', () => {
    const items = Array.from({length: MAX_MEDIA_ITEMS_PER_SESSION + 5}, (_, i) =>
      item(`i${i}`, {refPreview: `p${i}`}),
    )
    const out = sanitizeMediaSession(session('s1', 1, items), {
      maxItems: MAX_MEDIA_ITEMS_PER_SESSION,
      sanitizeItem: (x) => ({...x, refPreview: ''}),
    })
    expect(out.items).toHaveLength(MAX_MEDIA_ITEMS_PER_SESSION)
    expect(out.items[0].id).toBe('i5')
    expect(out.items.every((x) => x.refPreview === '')).toBe(true)
  })

  it('capMediaSessionCount 优先保留活跃与较新会话', () => {
    const sessions = Array.from({length: MAX_MEDIA_SESSIONS + 3}, (_, i) =>
      session(`s${i}`, i + 1, [item(`i${i}`)]),
    )
    const activeId = 's0'
    const out = capMediaSessionCount(sessions, activeId, MAX_MEDIA_SESSIONS)
    expect(out).toHaveLength(MAX_MEDIA_SESSIONS)
    expect(out.some((s) => s.id === activeId)).toBe(true)
    expect(out.some((s) => s.id === `s${MAX_MEDIA_SESSIONS + 2}`)).toBe(true)
  })

  it('trimMediaPayloadToBudget 超限时丢最旧非活跃会话条目', () => {
    const big = 'y'.repeat(8000)
    const sessions = [
      session(
        'old',
        1,
        Array.from({length: 20}, (_, i) => item(`o${i}`, {prompt: big})),
      ),
      session('active', 100, [item('a1', {prompt: 'keep-me'}), item('a2', {prompt: 'keep-2'})]),
    ]
    const {payload, trimmed, droppedItems} = trimMediaPayloadToBudget(
      {sessions, activeId: 'active'},
      20_000,
    )
    expect(trimmed).toBe(true)
    expect(droppedItems).toBeGreaterThan(0)
    expect(
      payload.sessions.find((s) => s.id === 'active')?.items.some((m) => m.prompt === 'keep-me'),
    ).toBe(true)
    expect(estimateJsonChars(payload)).toBeLessThanOrEqual(20_000)
  })

  it('prepareMediaPersistPayload 综合裁剪并可保持小载荷不变', () => {
    const small = prepareMediaPersistPayload({
      sessions: [session('s1', 1, [item('i1', {prompt: 'hello'})])],
      activeId: 's1',
    })
    expect(small.trimmed).toBe(false)
    expect(small.payload.sessions[0].items[0].prompt).toBe('hello')

    const many = Array.from({length: MAX_MEDIA_SESSIONS + 2}, (_, i) =>
      session(`s${i}`, i, [item(`i${i}`)]),
    )
    const capped = prepareMediaPersistPayload({sessions: many, activeId: 's0'})
    expect(capped.trimmed).toBe(true)
    expect(capped.payload.sessions.length).toBeLessThanOrEqual(MAX_MEDIA_SESSIONS)
  })

  it('collectDroppedMediaItems 识别被裁掉的条目', () => {
    const before = [
      session('s1', 1, [item('a'), item('b')]),
      session('s2', 2, [item('c')]),
    ]
    const after = [session('s1', 1, [item('b')])]
    const dropped = collectDroppedMediaItems(before, after)
    expect(dropped.map((x) => x.id).sort()).toEqual(['a', 'c'])
  })
})
