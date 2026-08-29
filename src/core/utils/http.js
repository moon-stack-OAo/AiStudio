import {fetch as tauriFetch} from '@tauri-apps/plugin-http'
import {isTauri} from '@core/utils/request'

/**
 * 合并请求头，并清空 Origin（plugin-http 会删除空 Origin）。
 * 注意：axios fetch 适配器常把已带 Authorization 的 Request 作为 input 传入，
 * 不能用「仅含 Origin」的 headers 覆盖，否则会丢掉 API Key。
 */
function withClearedOrigin(input, init = {}) {
  const headers = new Headers()

  if (input instanceof Request) {
    input.headers.forEach((value, key) => {
      headers.set(key, value)
    })
  }

  const extra = init.headers
  if (extra instanceof Headers) {
    extra.forEach((value, key) => {
      headers.set(key, value)
    })
  } else if (Array.isArray(extra)) {
    for (const [key, value] of extra) {
      headers.set(key, value)
    }
  } else if (extra && typeof extra === 'object') {
    for (const [key, value] of Object.entries(extra)) {
      if (value == null) continue
      headers.set(key, String(value))
    }
  }

  headers.set('Origin', '')
  return {...init, headers}
}

function resolveRequestUrl(input) {
  if (typeof input === 'string') return input
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.href
  return String(input || '')
}

/**
 * 拒绝明显危险目标。
 * 自定义中转 Base URL 是产品需求，capabilities 仍需较宽；此处做前端兜底校验。
 */
export function assertSafeFetchUrl(input) {
  const raw = resolveRequestUrl(input)
  if (!raw || raw.startsWith('/') || raw.startsWith('blob:') || raw.startsWith('data:')) {
    return
  }
  let url
  try {
    url = new URL(raw, typeof location !== 'undefined' ? location.href : undefined)
  } catch {
    throw new Error('无效的请求地址')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅允许 http/https 请求')
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === 'metadata') {
    throw new Error('拒绝访问云元数据地址')
  }
}

/**
 * 统一 fetch：桌面端走 Rust HTTP（绕过 WebView CORS），浏览器走原生 fetch。
 */
export function appFetch(input, init) {
  assertSafeFetchUrl(input)
  if (isTauri()) {
    return tauriFetch(input, withClearedOrigin(input, init))
  }
  return globalThis.fetch(input, init)
}
