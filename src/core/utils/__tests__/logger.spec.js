import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@core/utils/storage', () => {
  const mem = new Map()
  return {
    loadJSON: (key, fallback = null) => (mem.has(key) ? mem.get(key) : fallback),
    saveJSON: (key, value) => {
      mem.set(key, value)
      return true
    },
    removeKey: (key) => {
      mem.delete(key)
    },
    __mem: mem,
  }
})

describe('logger', () => {
  beforeEach(async () => {
    vi.resetModules()
    const storage = await import('@core/utils/storage')
    storage.__mem?.clear?.()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appends sanitized entries and enforces ring buffer', async () => {
    const {appendLog, getLogs, MAX_LOG_ENTRIES, clearLogs} = await import('../logger')
    clearLogs({persist: false})

    for (let i = 0; i < MAX_LOG_ENTRIES + 20; i += 1) {
      appendLog('info', `msg-${i}`, {source: 'test', persist: false})
    }
    const list = getLogs()
    expect(list).toHaveLength(MAX_LOG_ENTRIES)
    expect(list[0].message).toBe('msg-20')
    expect(list.at(-1).message).toBe(`msg-${MAX_LOG_ENTRIES + 19}`)
  })

  it('redacts api keys in message', async () => {
    const {appendLog, getLogs, clearLogs} = await import('../logger')
    clearLogs({persist: false})
    appendLog('error', 'Authorization Bearer sk-abcdefghijklmnopqrstuvwxyz', {
      source: 'test',
      persist: false,
    })
    const last = getLogs().at(-1)
    expect(last.message).not.toMatch(/sk-abcdefghijklmnopqrstuvwxyz/)
    expect(last.message).toMatch(/\*\*\*/)
  })

  it('filters by level and query', async () => {
    const {appendLog, filterLogs, getLogs, clearLogs} = await import('../logger')
    clearLogs({persist: false})
    appendLog('info', 'hello chat', {source: 'chat', persist: false})
    appendLog('error', 'boom image', {source: 'image', persist: false})
    appendLog('warn', 'slow video', {source: 'video', persist: false})

    const all = getLogs()
    expect(filterLogs(all, {level: 'error'})).toHaveLength(1)
    expect(filterLogs(all, {query: 'video'})[0].source).toBe('video')
    expect(filterLogs(all, {level: 'warn'})).toHaveLength(2)
  })

  it('persists and hydrates via initAppLogger', async () => {
    vi.useFakeTimers()
    const logger = await import('../logger')
    logger.clearLogs({persist: false})
    logger.appendLog('warn', 'persist-me', {source: 'app'})
    await vi.advanceTimersByTimeAsync(500)

    vi.resetModules()
    const logger2 = await import('../logger')
    logger2.initAppLogger()
    const found = logger2.getLogs().some((e) => e.message === 'persist-me')
    expect(found).toBe(true)
  })
})
