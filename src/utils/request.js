/** 是否运行在 Tauri 桌面环境 */
export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

/**
 * 是否应使用开发态 CORS 代理（仅浏览器 npm run dev）
 * 桌面端一律直连上游
 */
export function shouldUseCorsProxy(useCorsProxy) {
  if (!useCorsProxy) return false
  if (isTauri()) return false
  return Boolean(import.meta.env.DEV)
}

/**
 * 将真实 Base URL 转为实际请求地址。
 * 开启开发代理时：请求打到 /api-proxy，由 Vite 插件转发。
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
    msg.includes('NetworkError') ||
    msg.includes('error sending request') ||
    msg.includes('tcp connect error') ||
    msg.includes('dns error')

  if (!isNetwork) return msg

  const viaProxy = shouldUseCorsProxy(useCorsProxy)

  if (isTauri()) {
    return '网络失败：请检查 Base URL、API Key、上游服务是否可达，以及本机网络/证书（桌面端已走 Rust HTTP，与浏览器 CORS 无关）'
  }
  if (import.meta.env.DEV && !viaProxy) {
    return '网络失败（多为 CORS）。请在设置中开启「开发代理」，或改用 npm run tauri:dev'
  }
  if (import.meta.env.DEV && viaProxy) {
    return '网络失败：开发代理已开启仍失败，请检查 Base URL / 服务是否可达 / 证书'
  }
  return '网络失败：请检查 Base URL、网络，或确认接口是否允许浏览器跨域'
}
