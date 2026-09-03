import {beforeEach, describe, expect, it, vi} from 'vitest'
import {ref} from 'vue'

vi.mock('@core/api/client', () => ({
  ensureJobVideoMaterialized: vi.fn(async (job) => ({
    ...job,
    videoUrl: 'blob:reloaded',
    remoteVideoUrl: job.remoteVideoUrl || job.videoUrl,
    needsMaterialize: false,
  })),
  isVideoContentPath: (url) => /(?:\/v1)?\/videos\/[^/]+\/content\/?$/i.test(String(url || '')),
  toErrorMessage: (e, fallback) => e?.message || fallback || '错误',
}))

const {useVideoPlayback} = await import('../useVideoPlayback.js')
const {ensureJobVideoMaterialized} = await import('@core/api/client')

describe('useVideoPlayback reloadVideo', () => {
  let videoStore
  let message
  let session
  let provider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = {id: 'p1', baseUrl: 'https://proxy.example/v1', apiKey: 'sk-test'}
    session = ref({
      id: 's1',
      items: [
        {
          id: 'i1',
          providerId: 'p1',
          jobId: 'job-1',
          videoUrl: 'https://proxy.example/v1/videos/job-1/content',
          remoteVideoUrl: 'https://proxy.example/v1/videos/job-1/content',
          status: 'success',
        },
      ],
    })
    videoStore = {
      updateItem: vi.fn((_sid, _id, patch) => {
        Object.assign(session.value.items[0], patch)
      }),
    }
    message = {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    }
  })

  it('重新加载对 /content 走鉴权 materialize，而不是原样塞回 https', async () => {
    const api = useVideoPlayback({
      videoStore,
      message,
      getSession: () => session.value,
      getProviderById: () => provider,
    })
    await api.reloadVideo(session.value.items[0])
    expect(ensureJobVideoMaterialized).toHaveBeenCalled()
    expect(videoStore.updateItem).toHaveBeenCalledWith(
      's1',
      'i1',
      expect.objectContaining({
        videoUrl: 'blob:reloaded',
        needsMaterialize: false,
      }),
    )
    expect(message.success).toHaveBeenCalledWith('视频已重新加载')
  })

  it('播放失败时不把 /content 写回 videoUrl', () => {
    const api = useVideoPlayback({
      videoStore,
      message,
      getSession: () => session.value,
      getProviderById: () => provider,
    })
    api.onVideoError('i1')
    const patch = videoStore.updateItem.mock.calls.at(-1)[2]
    expect(patch.needsMaterialize).toBe(true)
    expect(patch.videoUrl).toBeUndefined()
  })
})
