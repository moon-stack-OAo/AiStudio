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
  waitVideoJob: vi.fn(),
}))

describe('store hydrate', () => {
  beforeEach(() => {
    storage.map.clear()
    storage.loadJSON.mockClear()
    storage.saveJSON.mockClear()
    setActivePinia(createPinia())
  })

  it('image: loading → error，并 sanitize 超长 refPreview', async () => {
    const longPreview = 'data:image/png;base64,' + 'a'.repeat(500)
    storage.map.set('image_sessions', {
      activeId: 'img1',
      sessions: [
        {
          id: 'img1',
          title: 't',
          type: 'image',
          createdAt: 1,
          updatedAt: 1,
          items: [
            {
              id: 'i1',
              status: 'loading',
              refPreview: longPreview,
              images: [],
            },
          ],
        },
      ],
    })
    const {useImageStore} = await import('../image.js')
    const store = useImageStore()
    const item = store.sessions[0].items[0]
    expect(item.status).toBe('error')
    expect(item.errorMessage).toMatch(/异常中断/)
    expect(item.refPreview).toBe('')
    expect(storage.saveJSON).toHaveBeenCalled()
  })

  it('video: 有 jobId 的 loading → pending_resume；blob 回退 remote', async () => {
    storage.map.set('video_sessions', {
      activeId: 'vid1',
      sessions: [
        {
          id: 'vid1',
          title: 't',
          type: 'video',
          createdAt: 1,
          updatedAt: 1,
          items: [
            {
              id: 'v1',
              status: 'loading',
              jobId: 'job-1',
              videoUrl: 'blob:http://local/x',
              remoteVideoUrl: 'https://cdn.example.com/a.mp4',
            },
            {
              id: 'v2',
              status: 'loading',
              videoUrl: '',
            },
          ],
        },
      ],
    })
    const {useVideoStore} = await import('../video.js')
    const store = useVideoStore()
    const [a, b] = store.sessions[0].items
    expect(a.status).toBe('pending_resume')
    expect(a.needsResume).toBe(true)
    expect(a.videoUrl).toBe('https://cdn.example.com/a.mp4')
    expect(b.status).toBe('error')
    expect(b.errorMessage).toMatch(/异常中断/)
  })

  it('chat: overrides 被规范化 hydrate', async () => {
    storage.map.set('chat_sessions', {
      activeId: 'c1',
      sessions: [
        {
          id: 'c1',
          title: 't',
          type: 'chat',
          createdAt: 1,
          updatedAt: 1,
          messages: [],
          overrides: {systemPrompt: 123, temperature: 9},
        },
      ],
    })
    const {useChatStore} = await import('../chat.js')
    const store = useChatStore()
    expect(store.sessions[0].overrides.systemPrompt).toBe('123')
    expect(store.sessions[0].overrides.temperature).toBe(2)
  })
})
