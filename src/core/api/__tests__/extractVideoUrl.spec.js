import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

vi.mock('@core/utils/request', () => ({
  isTauri: () => false,
  formatNetworkError: (_e, _proxy) => '',
  proxyHeaders: (_base, _proxy, headers) => headers || {},
  resolveBaseUrl: (base) => base || '',
}))

const {extractVideoUrl, materializeRemoteVideoUrl, ensureJobVideoMaterialized} =
  await import('../client.js')

describe('extractVideoUrl', () => {
  it('优先 video.url（xAI），即使顶层有误导性 url', () => {
    expect(
      extractVideoUrl({
        status: 'done',
        url: 'https://api.x.ai/v1/videos/misleading',
        video: {url: 'https://vidgen.x.ai/x.mp4'},
      }),
    ).toBe('https://vidgen.x.ai/x.mp4')
  })

  it('优先绝对直链，避开相对 /content', () => {
    expect(
      extractVideoUrl({
        status: 'done',
        url: '/v1/videos/7ab4a865/content',
        video: {url: 'https://vidgen.x.ai/real.mp4'},
      }),
    ).toBe('https://vidgen.x.ai/real.mp4')
  })

  it('仅有相对 /content 时原样返回（后续鉴权拉流）', () => {
    expect(
      extractVideoUrl({
        status: 'completed',
        url: '/v1/videos/7ab4a865-6bbc-951b-8e55-60b414436e77/content',
      }),
    ).toBe('/v1/videos/7ab4a865-6bbc-951b-8e55-60b414436e77/content')
  })

  it('优先嵌套 video 字段，再顶层临时直链', () => {
    expect(extractVideoUrl({video: {url: 'https://vidgen.x.ai/v.mp4'}})).toBe(
      'https://vidgen.x.ai/v.mp4',
    )
    expect(extractVideoUrl({url: 'https://a/tmp.mp4', public_url: 'https://a/pub.mp4'})).toBe(
      'https://a/tmp.mp4',
    )
    expect(extractVideoUrl({video_url: 'https://a/snake.mp4'})).toBe('https://a/snake.mp4')
    expect(extractVideoUrl({videoUrl: 'https://a/camel.mp4'})).toBe('https://a/camel.mp4')
  })

  it('无临时 url 时回退 public_url', () => {
    expect(extractVideoUrl({video: {public_url: 'https://a/public.mp4'}})).toBe(
      'https://a/public.mp4',
    )
    expect(extractVideoUrl({public_url: 'https://a/root-public.mp4'})).toBe(
      'https://a/root-public.mp4',
    )
  })

  it('支持 video 数组首项', () => {
    expect(
      extractVideoUrl({
        video: [{url: 'https://a/arr.mp4'}, {url: 'https://a/other.mp4'}],
      }),
    ).toBe('https://a/arr.mp4')
  })

  it('空对象返回空串', () => {
    expect(extractVideoUrl(null)).toBe('')
    expect(extractVideoUrl({})).toBe('')
  })
})

describe('materializeRemoteVideoUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // 最小合法 mp4 头：size(4) + 'ftyp'
    const ftyp = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00,
      0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () =>
          ftyp.buffer.slice(ftyp.byteOffset, ftyp.byteOffset + ftyp.byteLength),
        blob: async () => new Blob([ftyp], {type: 'application/octet-stream'}),
      })),
    )
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = vi.fn(() => 'blob:mock-video')
    } else {
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-video')
    }
  })

  it('已是 blob/data 则原样返回', async () => {
    await expect(materializeRemoteVideoUrl('blob:http://x/1')).resolves.toBe('blob:http://x/1')
    await expect(materializeRemoteVideoUrl('data:video/mp4,abc')).resolves.toBe(
      'data:video/mp4,abc',
    )
  })

  it('http(s) 拉取后强制 video/mp4 MIME 再 createObjectURL', async () => {
    const url = await materializeRemoteVideoUrl('https://vidgen.x.ai/clip.mp4')
    expect(url).toBe('blob:mock-video')
    expect(globalThis.fetch).toHaveBeenCalled()
    expect(URL.createObjectURL).toHaveBeenCalled()
    const blobArg = URL.createObjectURL.mock.calls[0][0]
    expect(blobArg).toBeInstanceOf(Blob)
    expect(blobArg.type).toBe('video/mp4')
    expect(blobArg.size).toBeGreaterThan(0)
  })

  it('空内容抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )
    await expect(materializeRemoteVideoUrl('https://vidgen.x.ai/empty.mp4')).rejects.toThrow(
      /视频内容为空/,
    )
  })

  it('空地址抛错', async () => {
    await expect(materializeRemoteVideoUrl('')).rejects.toThrow(/缺少视频地址/)
  })
})

describe('ensureJobVideoMaterialized', () => {
  it('完成态保留 https 为 videoUrl，并写入 remoteVideoUrl（不转 blob）', async () => {
    const job = {
      status: 'completed',
      videoUrl: 'https://vidgen.x.ai/clip.mp4',
    }
    const out = await ensureJobVideoMaterialized(job)
    expect(out.videoUrl).toBe('https://vidgen.x.ai/clip.mp4')
    expect(out.remoteVideoUrl).toBe('https://vidgen.x.ai/clip.mp4')
    expect(out.needsMaterialize).toBe(false)
    expect(String(out.videoUrl).startsWith('blob:')).toBe(false)
  })

  it('blob/data 原样返回，不改写', async () => {
    const job = {
      status: 'completed',
      videoUrl: 'blob:http://x/1',
      remoteVideoUrl: 'https://a/x.mp4',
    }
    const out = await ensureJobVideoMaterialized(job)
    expect(out.videoUrl).toBe('blob:http://x/1')
    expect(out.remoteVideoUrl).toBe('https://a/x.mp4')
  })

  it('非完成态不处理', async () => {
    const job = {status: 'in_progress', videoUrl: 'https://vidgen.x.ai/x.mp4'}
    const out = await ensureJobVideoMaterialized(job)
    expect(out.remoteVideoUrl).toBeUndefined()
    expect(out.videoUrl).toBe('https://vidgen.x.ai/x.mp4')
  })
})
