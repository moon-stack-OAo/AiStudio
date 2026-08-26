/** 是否运行在 Tauri 桌面环境 */
export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

/**
 * 是否为「经本地服务打开的浏览器页」
 *（同源可走 /api-proxy，无需 Vite CORS 插件）
 */
export function isLocalServerPage() {
  if (typeof window === 'undefined') return false
  if (isTauri()) return false
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('t') || q.get('token')) return true
  } catch {
    /* ignore */
  }
  try {
    if (/(?:^|;\s*)ai_studio_token=/.test(document.cookie || '')) return true
  } catch {
    /* ignore */
  }
  const port = Number(window.location.port)
  // 默认区间 + 常见自定义端口启发式
  if (port >= 17890 && port <= 17999) return true
  return false
}

/** 本地服务是否启用 API 代理（浏览器页经 /api/local/info 缓存；未知时默认 true） */
let cachedProxyEnabled = true

export function setCachedProxyEnabled(enabled) {
  cachedProxyEnabled = enabled !== false
}

export function getCachedProxyEnabled() {
  return cachedProxyEnabled
}

/**
 * 是否应使用 CORS/本地 API 代理
 * - Tauri WebView：直连上游（无浏览器 CORS）
 * - 浏览器 DEV 且非本地服务页：Vite /api-proxy
 * - 本地服务托管的浏览器页：同源 /api-proxy（需服务端 proxyEnabled）
 */
export function shouldUseCorsProxy(useCorsProxy) {
  if (!useCorsProxy) return false
  if (isTauri()) return false
  if (isLocalServerPage()) {
    return getCachedProxyEnabled()
  }
  if (import.meta.env.DEV) return true
  return false
}

/**
 * 将真实 Base URL 转为实际请求地址。
 * 开启代理时：请求打到同源 /api-proxy，由 Vite 或本地服务转发到目标站。
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
    // 本地服务页：Authorization 为上游 API Key，另带本地 token 鉴权（Cookie 未就绪时兜底）
    if (isLocalServerPage() && typeof window !== 'undefined') {
      try {
        const q = new URLSearchParams(window.location.search)
        const t = q.get('t') || q.get('token')
        if (t) headers['X-Access-Token'] = t
      } catch {
        /* ignore */
      }
    }
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

  if (isLocalServerPage()) {
    if (!useCorsProxy) {
      return '网络失败（多为 CORS）。请在设置中开启「使用本地 API 代理」'
    }
    return '网络失败：本地 API 代理已开启仍失败，请检查 Base URL / 服务可达性 / 设置中是否启用代理'
  }
  if (import.meta.env.DEV && !useCorsProxy) {
    return '网络失败（多为 CORS）。请在设置中开启「开发代理」，或改用 npm run tauri:dev'
  }
  if (import.meta.env.DEV && useCorsProxy) {
    return '网络失败：开发代理已开启仍失败，请检查 Base URL / 服务是否可达 / 证书'
  }
  return '网络失败：请检查 Base URL、网络，或确认接口是否允许浏览器跨域'
}
