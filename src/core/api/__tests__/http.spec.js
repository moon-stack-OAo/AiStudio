import {describe, expect, it, vi} from 'vitest'

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

vi.mock('@core/utils/request', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isTauri: () => false,
  }
})

const {appFetch} = await import('@core/utils/http')
const {buildAxiosConfig, createApiClient} = await import('../http.js')

describe('buildAxiosConfig', () => {
  it('浏览器也强制 fetch adapter + appFetch', () => {
    const config = buildAxiosConfig({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      useCorsProxy: false,
    })
    expect(config.adapter).toBe('fetch')
    expect(config.env.fetch).toBe(appFetch)
  })
})

describe('createApiClient', () => {
  it('axios JSON 请求会触发 assertSafeFetchUrl', async () => {
    const client = createApiClient({
      baseUrl: 'http://169.254.169.254',
      apiKey: 'sk-test',
      useCorsProxy: false,
    })
    await expect(client.get('/latest/meta-data/')).rejects.toThrow(
      '拒绝访问云元数据或受保护地址',
    )
  })

  it('拦截器不挂完整 axios response/config（无 Authorization）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({error: {message: 'bad'}}), {
        status: 400,
        headers: {'Content-Type': 'application/json'},
      }),
    )
    const client = createApiClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-key-value',
      useCorsProxy: false,
    })
    client.defaults.env.fetch = fetchMock

    let caught
    try {
      await client.get('/fail')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect(caught.status).toBe(400)
    expect(caught.response?.status).toBe(400)
    expect(caught.response?.config).toBeUndefined()
    expect(caught.response?.headers).toBeUndefined()
    const dumped = JSON.stringify(caught.response)
    expect(dumped).not.toMatch(/Authorization|sk-secret/i)
  })
})
