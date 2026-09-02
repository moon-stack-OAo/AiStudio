import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

vi.mock('@core/utils/request', () => ({
  isTauri: () => false,
  formatNetworkError: () => '',
  proxyHeaders: (_base, _proxy, headers) => headers || {},
  resolveBaseUrl: (base) => String(base || '').replace(/\/+$/, ''),
}))

const {appFetch} = vi.hoisted(() => ({appFetch: vi.fn()}))
vi.mock('@core/utils/http', () => ({appFetch}))

const {streamChatCompletions} = await import('../chat.js')

function sseResponse(chunks, {ok = true, status = 200} = {}) {
  const encoder = new TextEncoder()
  let i = 0
  return {
    ok,
    status,
    body: {
      getReader() {
        return {
          async read() {
            if (i >= chunks.length) return {done: true, value: undefined}
            const value = encoder.encode(chunks[i++])
            return {done: false, value}
          },
          async cancel() {},
        }
      },
    },
    async text() {
      return chunks.join('')
    },
  }
}

describe('streamChatCompletions', () => {
  const provider = {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    chatModel: 'gpt-test',
  }

  beforeEach(() => {
    appFetch.mockReset()
  })

  it('拼接分片 delta，遇到 [DONE] 结束', async () => {
    appFetch.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n',
        'data: [DONE]\n',
      ]),
    )
    const deltas = []
    const full = await streamChatCompletions(provider, {
      messages: [{role: 'user', content: 'hi'}],
      onDelta: (d, all) => deltas.push([d, all]),
    })
    expect(full).toBe('你好')
    expect(deltas).toEqual([
      ['你', '你'],
      ['好', '你好'],
    ])
  })

  it('中途 error 事件抛出业务错误', async () => {
    appFetch.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"前"}}]}\n',
        'data: {"error":{"message":"上游限流"}}\n',
      ]),
    )
    await expect(
      streamChatCompletions(provider, {
        messages: [{role: 'user', content: 'hi'}],
      }),
    ).rejects.toThrow(/上游限流/)
  })

  it('signal 取消抛出 AbortError', async () => {
    const ac = new AbortController()
    appFetch.mockImplementation(async (_url, opts) => {
      const signal = opts?.signal
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                ac.abort()
                if (signal?.aborted) {
                  const err = new Error('aborted')
                  err.name = 'AbortError'
                  throw err
                }
                return {done: true, value: undefined}
              },
              async cancel() {},
            }
          },
        },
      }
    })
    await expect(
      streamChatCompletions(provider, {
        messages: [{role: 'user', content: 'hi'}],
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({name: 'AbortError'})
  })
})
