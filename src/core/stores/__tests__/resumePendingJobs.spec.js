import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const storage = vi.hoisted(() => {
  const map = new Map()
  return {
    map,
    loadJSON: vi.fn((key, fallback = null) => (map.has(key) ? map.get(key) : fallback)),
    saveJSON: vi.fn((key, value) => {
      map.set(key, value)
      return true
    }),
  }
})

const waitVideoJob = vi.hoisted(() => vi.fn())

vi.mock('@core/utils/storage', () => ({
  loadJSON: storage.loadJSON,
  saveJSON: storage.saveJSON,
}))

vi.mock('@core/utils/toast', () => ({
  notifyStorageError: vi.fn(),
  notifyStorageWarning: vi.fn(),
}))

vi.mock('@core/utils/imageCache', () => ({
  collectCacheIds: () => [],
  deleteImages: vi.fn(),
}))

vi.mock('@core/api/client', () => ({
  toErrorMessage: (e, fb) => e?.message || fb || 'err',
  waitVideoJob,
}))

describe('videoStore.resumePendingJobs', () => {
  beforeEach(() => {
    storage.map.clear()
    waitVideoJob.mockReset()
    setActivePinia(createPinia())
  })

  it('单条 Abort 不抛错，且不启动同批后续项', async () => {
    const {useVideoStore} = await import('@core/stores/video')
    const store = useVideoStore()
    const sessionId = store.activeId
    const a = store.addItem(sessionId, {
      prompt: 'a',
      status: 'pending_resume',
      needsResume: true,
      jobId: 'job-a',
      providerId: 'p1',
    })
    const b = store.addItem(sessionId, {
      prompt: 'b',
      status: 'pending_resume',
      needsResume: true,
      jobId: 'job-b',
      providerId: 'p1',
    })

    const controller = new AbortController()
    waitVideoJob.mockImplementationOnce(async (_p, _id, {signal}) => {
      controller.abort()
      const err = new Error('aborted')
      err.name = 'AbortError'
      if (signal?.aborted) throw err
      throw err
    })

    const provider = {id: 'p1', baseUrl: 'https://example.com/v1', apiKey: 'k'}
    const results = await store.resumePendingJobs(() => provider, {signal: controller.signal})

    expect(results).toHaveLength(1)
    expect(results[0].itemId).toBe(a.id)
    expect(results[0].error?.name).toBe('AbortError')
    expect(waitVideoJob).toHaveBeenCalledTimes(1)

    const items = store.activeSession.items
    const itemA = items.find((i) => i.id === a.id)
    const itemB = items.find((i) => i.id === b.id)
    expect(itemA.status).toBe('pending_resume')
    expect(itemA.needsResume).toBe(true)
    expect(itemB.status).toBe('pending_resume')
    expect(itemB.needsResume).toBe(true)
  })
})
