import {describe, it, expect, vi} from 'vitest'

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

vi.mock('@core/utils/request', () => ({
  isTauri: () => false,
}))

const {assertSafeFetchUrl} = await import('@core/utils/http')

describe('assertSafeFetchUrl', () => {
  it('相对路径 /、blob:、data: 放行', () => {
    expect(() => assertSafeFetchUrl('/api/chat')).not.toThrow()
    expect(() => assertSafeFetchUrl('blob:http://localhost/abc')).not.toThrow()
    expect(() => assertSafeFetchUrl('data:text/plain,hello')).not.toThrow()
  })

  it('http/https 正常 URL 放行', () => {
    expect(() => assertSafeFetchUrl('https://api.openai.com/v1/chat')).not.toThrow()
    expect(() => assertSafeFetchUrl('http://127.0.0.1:8080/')).not.toThrow()
  })

  it('非 http(s) 协议拒绝', () => {
    expect(() => assertSafeFetchUrl('file:///etc/passwd')).toThrow('仅允许 http/https 请求')
    expect(() => assertSafeFetchUrl('ftp://example.com/file')).toThrow('仅允许 http/https 请求')
  })

  it('云元数据 host 拒绝', () => {
    expect(() => assertSafeFetchUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
      '拒绝访问云元数据地址',
    )
    expect(() => assertSafeFetchUrl('http://metadata.google.internal/computeMetadata/v1/')).toThrow(
      '拒绝访问云元数据地址',
    )
    expect(() => assertSafeFetchUrl('http://metadata/computeMetadata/v1/')).toThrow(
      '拒绝访问云元数据地址',
    )
  })
})
