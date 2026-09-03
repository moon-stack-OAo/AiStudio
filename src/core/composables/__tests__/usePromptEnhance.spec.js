import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {ref} from 'vue'
import {usePromptEnhance} from '@core/composables/usePromptEnhance'

const lifecycle = vi.hoisted(() => ({unmounted: [], deactivated: []}))
const promptApi = vi.hoisted(() => ({enhancePrompt: vi.fn()}))

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    onUnmounted: (fn) => lifecycle.unmounted.push(fn),
    onDeactivated: (fn) => lifecycle.deactivated.push(fn),
  }
})

vi.mock('@core/prompts/enhancePrompt', () => ({
  enhancePrompt: promptApi.enhancePrompt,
  generatePromptFromLabel: vi.fn(),
}))

vi.mock('@core/utils/storage', () => ({
  loadJSON: vi.fn((_key, fallback = null) => fallback),
  saveJSON: vi.fn(() => true),
}))

describe('usePromptEnhance', () => {
  beforeEach(() => {
    lifecycle.unmounted = []
    lifecycle.deactivated = []
    promptApi.enhancePrompt.mockReset()
    setActivePinia(createPinia())
  })

  it('无 stateKey：请求中卸载组件 → abort 生效且 enhancing 复位', async () => {
    promptApi.enhancePrompt.mockImplementation(() => new Promise(() => {}))
    const api = usePromptEnhance()
    const pending = api.enhance('hi', {domain: 'image'})
    expect(api.enhancing.value).toBe(true)

    lifecycle.unmounted.forEach((fn) => fn())

    await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    expect(api.enhancing.value).toBe(false)
    expect(promptApi.enhancePrompt.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('有 stateKey：卸载组件不中断请求，同 key 新实例延续 enhancing', async () => {
    let resolveRun
    promptApi.enhancePrompt.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRun = resolve
        }),
    )
    const a = usePromptEnhance('image:s1')
    const pending = a.enhance('hi', {domain: 'image'})
    expect(a.enhancing.value).toBe(true)
    await Promise.resolve()

    expect(lifecycle.unmounted).toHaveLength(0)
    expect(a.enhancing.value).toBe(true)

    const b = usePromptEnhance('image:s1')
    expect(b.enhancing.value).toBe(true)

    resolveRun('better')
    await expect(pending).resolves.toBe('better')
    expect(b.enhancing.value).toBe(false)
    expect(a.enhancing.value).toBe(false)
    expect(promptApi.enhancePrompt.mock.calls[0][1].signal.aborted).toBe(false)
  })

  it('不同 stateKey 状态互相隔离', async () => {
    promptApi.enhancePrompt.mockImplementation(() => new Promise(() => {}))
    const a = usePromptEnhance('image:k1')
    const b = usePromptEnhance('image:k2')
    a.enhance('hi', {domain: 'image'}).catch(() => {})
    expect(a.enhancing.value).toBe(true)
    expect(b.enhancing.value).toBe(false)

    b.enhance('yo', {domain: 'image'}).catch(() => {})
    expect(b.enhancing.value).toBe(true)

    a.abort()
    expect(a.enhancing.value).toBe(false)
    expect(b.enhancing.value).toBe(true)

    b.abort()
    expect(b.enhancing.value).toBe(false)
  })

  it('stateKey 支持 ref 传入并与其他实例共享', async () => {
    promptApi.enhancePrompt.mockImplementation(() => new Promise(() => {}))
    const keyRef = ref('image:r1')
    const a = usePromptEnhance(keyRef)
    a.enhance('hi', {domain: 'image'}).catch(() => {})

    const b = usePromptEnhance('image:r1')
    expect(b.enhancing.value).toBe(true)

    a.abort()
    expect(b.enhancing.value).toBe(false)
  })
})
