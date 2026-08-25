/** 是否运行在 Tauri 桌面环境 */
export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

/** 是否应使用开发代理绕过浏览器 CORS */
export function shouldUseCorsProxy(useCorsProxy) {
  if (!useCorsProxy) return false
  // 仅浏览器开发态需要；Tauri 打包后走自身网络栈，仍可能遇 CORS，但代理仅 Vite 开发服有
  if (isTauri()) return false
  return import.meta.env.DEV
}

/**
 * 将真实 Base URL 转为实际请求地址。
 * 开启代理时：请求打到同源 /api-proxy，由 Vite 转发到目标站。
 */
export function resolveBaseUrl(baseUrl, useCorsProxy) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '')
  if (!normalized) return ''
  if (!shouldUseCorsProxy(useCorsProxy)) return normalized
  return '/api-proxy'
}

export function proxyHeaders(baseUrl, useCorsProxy, extra = {}) {
  const headers = { ...extra }
  if (shouldUseCorsProxy(useCorsProxy)) {
    headers['X-Proxy-Target'] = String(baseUrl || '').replace(/\/+$/, '')
  }
  return headers
}

export function formatNetworkError(error, useCorsProxy) {
  const msg = error?.message || String(error)
  const isNetwork =
    msg === 'Network Error' ||
    msg.includes('Failed to fetch') ||
    msg.includes('ERR_FAILED') ||
    msg.includes('NetworkError')

  if (!isNetwork) return msg

  if (import.meta.env.DEV && !useCorsProxy) {
    return '网络失败（多为 CORS）。请在设置中开启「开发代理」，或改用 npm run tauri:dev'
  }
  if (import.meta.env.DEV && useCorsProxy) {
    return '网络失败：开发代理已开启仍失败，请检查 Base URL / 服务是否可达 / 证书'
  }
  return '网络失败：请检查 Base URL、网络，或确认接口是否允许浏览器跨域'
}
