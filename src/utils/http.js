import {fetch as tauriFetch} from '@tauri-apps/plugin-http'
import {isTauri} from '@/utils/request'

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
  return { ...init, headers }
}

/**
 * 统一 fetch：桌面端走 Rust HTTP（绕过 WebView CORS），浏览器走原生 fetch。
 */
export function appFetch(input, init) {
  if (isTauri()) {
    return tauriFetch(input, withClearedOrigin(input, init))
  }
  return globalThis.fetch(input, init)
}
