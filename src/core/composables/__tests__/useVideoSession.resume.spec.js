import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {effectScope} from 'vue'
import {videoGeneration} from '@core/runtime/generationRuntime'

const vueLifecycle = vi.hoisted(() => ({
  onMounted: vi.fn(),
  onActivated: vi.fn(),
  onBeforeUnmount: vi.fn(),
}))

const messageApi = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

const runGenerate = vi.hoisted(() => vi.fn())
const waitVideoJob = vi.hoisted(() => vi.fn())

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    onMounted: vueLifecycle.onMounted,
    onActivated: vueLifecycle.onActivated,
    onBeforeUnmount: vueLifecycle.onBeforeUnmount,
  }
})

vi.mock('naive-ui', () => ({
  useMessage: () => messageApi,
  useDialog: () => ({
    warning: vi.fn(),
  }),
}))

vi.mock('@core/utils/storage', () => ({
  loadJSON: vi.fn((_key, fallback = null) => fallback),
  saveJSON: vi.fn(() => true),
}))

vi.mock('@core/utils/toast', () => ({
  notifyStorageError: vi.fn(),
  notifyStorageWarning: vi.fn(),
}))

vi.mock('@core/api/client', () => ({
  fileToPreview: vi.fn(async () => 'data:image/png;base64,xx'),
  getCapabilities: () => ({
    video: {
      sizeMode: 'pixels',
      sizes: ['1280x720'],
      durationMin: 1,
      durationMax: 8,
      durationDefault: 8,
    },
  }),
  toErrorMessage: (e, fb) => e?.message || fb || 'err',
  waitVideoJob,
}))

vi.mock('@core/composables/useVideoGeneration', () => ({
  useVideoGeneration: () => ({
    runGenerate,
    lastError: {value: ''},
  }),
}))

vi.mock('@core/composables/useClipboardImage', () => ({
  useClipboardImage: () => ({onPaste: vi.fn()}),
}))

describe('useVideoSession resume/busy V1', () => {
  beforeEach(() => {
    messageApi.warning.mockClear()
    messageApi.success.mockClear()
    messageApi.error.mockClear()
    runGenerate.mockReset()
    waitVideoJob.mockReset()
    vueLifecycle.onMounted.mockClear()
    vueLifecycle.onActivated.mockClear()
    vueLifecycle.onBeforeUnmount.mockClear()
    globalThis.window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    if (videoGeneration.sessionId) {
      videoGeneration.end(videoGeneration.sessionId)
    }
    setActivePinia(createPinia())
  })

  async function setupSession() {
    const {useSettingsStore} = await import('@core/stores/settings')
    const {useVideoStore} = await import('@core/stores/video')
    const {useVideoSession} = await import('@core/composables/useVideoSession')
    const settings = useSettingsStore()
    const videoStore = useVideoStore()
    const p = settings.activeProvider
    if (p) {
      settings.updateProvider(p.id, {
        baseUrl: 'https://example.com/v1',
        apiKey: 'test-key',
        videoModel: 'sora-2',
      })
    }
    const scope = effectScope(true)
    const api = scope.run(() => useVideoSession())
    const unmountCbs = vueLifecycle.onBeforeUnmount.mock.calls.map((c) => c[0]).filter(Boolean)
    return {api, scope, videoStore, settings, unmountCbs, providerId: p?.id || ''}
  }

  it('纯 pending_resume 不锁发送区', async () => {
    const {api, scope, videoStore} = await setupSession()
    videoStore.addItem(videoStore.activeId, {
      prompt: 'wait',
      status: 'pending_resume',
      needsResume: true,
      jobId: 'job-1',
    })
    api.prompt.value = 'hello'
    expect(api.isGeneratingCurrent.value).toBe(false)
    expect(api.canGenerate.value).toBe(true)
    expect(api.gen.busy).toBe(false)
    scope.stop()
  })

  it('busy 时拒绝 resumeItem', async () => {
    const {api, scope, videoStore} = await setupSession()
    const sessionId = videoStore.activeId
    const item = videoStore.addItem(sessionId, {
      prompt: 'wait',
      status: 'pending_resume',
      needsResume: true,
      jobId: 'job-1',
    })
    const controller = new AbortController()
    videoGeneration.begin(sessionId, controller)
    api.resumeItem(item)
    expect(messageApi.warning).toHaveBeenCalledWith('当前有任务进行中，请稍后再试')
    expect(api.isResuming.value).toBe(false)
    videoGeneration.end(sessionId, controller)
    scope.stop()
  })

  it('generate 会先 abort resume 并释放 busy', async () => {
    const {api, scope, videoStore, providerId} = await setupSession()
    const sessionId = videoStore.activeId
    videoStore.addItem(sessionId, {
      prompt: 'wait',
      status: 'pending_resume',
      needsResume: true,
      jobId: 'job-1',
      providerId,
    })

    let resumeSignal
    waitVideoJob.mockImplementation((_p, _id, {signal}) => {
      resumeSignal = signal
      return new Promise(() => {})
    })

    api.startResumeIfNeeded()
    expect(api.gen.busy).toBe(true)
    expect(api.isResuming.value).toBe(true)
    await Promise.resolve()
    expect(resumeSignal).toBeTruthy()

    runGenerate.mockResolvedValue({
      itemId: 'new',
      job: {status: 'completed', videoUrl: 'https://example.com/v.mp4'},
    })
    api.prompt.value = 'new gen'
    await api.generate()

    expect(resumeSignal.aborted).toBe(true)
    expect(runGenerate).toHaveBeenCalled()
    expect(api.isResuming.value).toBe(false)
    scope.stop()
  })

  it('当前 loading 时 generate 入口拒绝叠任务', async () => {
    const {api, scope, videoStore} = await setupSession()
    videoStore.addItem(videoStore.activeId, {
      prompt: 'loading',
      status: 'loading',
      jobId: 'job-x',
    })
    api.prompt.value = 'again'
    await api.generate()
    expect(runGenerate).not.toHaveBeenCalled()
    scope.stop()
  })

  it('unmount 只 abort resume，不 abort generate', async () => {
    const {api, scope, videoStore, providerId, unmountCbs} = await setupSession()
    const sessionId = videoStore.activeId
    videoStore.addItem(sessionId, {
      prompt: 'wait',
      status: 'pending_resume',
      needsResume: true,
      jobId: 'job-1',
      providerId,
    })

    let resumeSignal
    waitVideoJob.mockImplementation((_p, _id, {signal}) => {
      resumeSignal = signal
      return new Promise(() => {})
    })
    api.startResumeIfNeeded()
    await Promise.resolve()
    expect(api.isResuming.value).toBe(true)
    expect(resumeSignal).toBeTruthy()

    // 第一次 unmount：杀掉 resume
    for (const cb of unmountCbs) cb()
    expect(resumeSignal.aborted).toBe(true)
    expect(api.isResuming.value).toBe(false)

    // generate 仍可跨页占用 busy；再次 unmount 不得 abort 它
    const genController = new AbortController()
    videoGeneration.begin(sessionId, genController)
    for (const cb of unmountCbs) cb()
    expect(genController.signal.aborted).toBe(false)
    expect(videoGeneration.busy).toBe(true)

    videoGeneration.end(sessionId, genController)
    scope.stop()
  })

  it('stopGenerate 后不自动重踢 resume', async () => {
    const {api, scope, videoStore, providerId} = await setupSession()
    const sessionId = videoStore.activeId
    const item = videoStore.addItem(sessionId, {
      prompt: 'wait',
      status: 'pending_resume',
      needsResume: true,
      jobId: 'job-1',
      providerId,
    })

    waitVideoJob.mockImplementation(() => new Promise(() => {}))
    api.startResumeIfNeeded()
    await Promise.resolve()
    expect(api.gen.busy).toBe(true)

    api.stopGenerate()
    expect(api.gen.busy).toBe(false)
    expect(api.isResuming.value).toBe(false)
    const live = videoStore.activeSession.items.find((i) => i.id === item.id)
    expect(live.status).toBe('pending_resume')
    expect(live.needsResume).toBe(true)
    // 不应再次自动 start（仍 idle）
    expect(waitVideoJob.mock.calls.length).toBe(1)
    scope.stop()
  })
})
