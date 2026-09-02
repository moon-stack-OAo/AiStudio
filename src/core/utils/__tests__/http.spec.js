import {describe, expect, it, vi} from 'vitest'

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: vi.fn(),
}))

vi.mock('@core/utils/request', () => ({
  isTauri: () => false,
}))

const {assertSafeFetchUrl, warnUnsafeUrl} = await import('@core/utils/http')

describe('assertSafeFetchUrl', () => {
  it('相对路径 /、blob:、data: 放行', () => {
    expect(() => assertSafeFetchUrl('/api/chat')).not.toThrow()
    expect(() => assertSafeFetchUrl('blob:http://localhost/abc')).not.toThrow()
    expect(() => assertSafeFetchUrl('data:text/plain,hello')).not.toThrow()
  })

  it('http/https 公网与本地中转放行（产品依赖本地/内网中转）', () => {
    expect(() => assertSafeFetchUrl('https://api.openai.com/v1/chat')).not.toThrow()
    // 故意放行：本地中转调试
    expect(() => assertSafeFetchUrl('http://127.0.0.1:8080/')).not.toThrow()
    expect(() => assertSafeFetchUrl('http://localhost:3000/v1')).not.toThrow()
    expect(() => assertSafeFetchUrl('http://192.168.1.10:8080/v1')).not.toThrow()
  })

  it('非 http(s) 协议拒绝', () => {
    expect(() => assertSafeFetchUrl('file:///etc/passwd')).toThrow('仅允许 http/https 请求')
    expect(() => assertSafeFetchUrl('ftp://example.com/file')).toThrow('仅允许 http/https 请求')
  })

  it('云元数据 / 链路本地 / 特殊地址拒绝', () => {
    expect(() => assertSafeFetchUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
    expect(() => assertSafeFetchUrl('http://169.254.1.1/')).toThrow('拒绝访问云元数据或受保护地址')
    expect(() => assertSafeFetchUrl('http://metadata.google.internal/computeMetadata/v1/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
    expect(() => assertSafeFetchUrl('http://metadata.google/computeMetadata/v1/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
    expect(() => assertSafeFetchUrl('http://metadata/computeMetadata/v1/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
    expect(() => assertSafeFetchUrl('http://kubernetes.default/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
    expect(() => assertSafeFetchUrl('http://kubernetes.default.svc/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
    expect(() => assertSafeFetchUrl('http://0.0.0.0/')).toThrow('拒绝访问云元数据或受保护地址')
    expect(() => assertSafeFetchUrl('http://[::]/')).toThrow('拒绝访问云元数据或受保护地址')
    expect(() => assertSafeFetchUrl('http://[::1]/')).toThrow('拒绝访问云元数据或受保护地址')
    expect(() => assertSafeFetchUrl('http://[fd00:ec2::254]/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
    expect(() => assertSafeFetchUrl('http://[::ffff:169.254.169.254]/')).toThrow(
      '拒绝访问云元数据或受保护地址',
    )
  })
})

describe('warnUnsafeUrl', () => {
  it('公网 https 无提示', () => {
    expect(warnUnsafeUrl('https://api.openai.com/v1')).toBeNull()
  })

  it('明文 http / 本机 / RFC1918 给出提示', () => {
    expect(warnUnsafeUrl('http://api.example.com/v1')).toMatch(/明文 HTTP/)
    expect(warnUnsafeUrl('http://127.0.0.1:8080/v1')).toMatch(/本机/)
    expect(warnUnsafeUrl('https://10.0.0.5/v1')).toMatch(/私有网段/)
  })
})
