/**
 * 是否运行在 Tauri（含桌面 / Android / iOS）
 * @returns {boolean}
 */
export function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

/**
 * 是否为桌面端 Tauri（自定义标题栏 / 托盘 / 桌面 Updater）
 * Android、iOS 上 isTauri() 也为 true，但不走桌面帧逻辑
 * @returns {boolean}
 */
export function isDesktopTauri() {
  if (!isTauri()) return false
  const p = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/Android/i.test(p)) return false
  if (/iPhone|iPad|iPod/i.test(p)) return false
  return true
}

/**
 * 是否为 Android Tauri（侧载清单更新）
 * @returns {boolean}
 */
export function isAndroidTauri() {
  if (!isTauri()) return false
  const p = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  return /Android/i.test(p)
}

/**
 * 是否应使用开发态 CORS 代理（仅浏览器 npm run dev）
 * 桌面端一律直连上游
 * @param {boolean} useCorsProxy 用户设置中的开关
 * @returns {boolean}
 */
export function shouldUseCorsProxy(useCorsProxy) {
  if (!useCorsProxy) return false
  if (isTauri()) return false
  return Boolean(import.meta.env.DEV)
}

/**
 * 将真实 Base URL 转为实际请求地址。
 * 开启开发代理时：请求打到 /api-proxy，由 Vite 插件转发。
 * @param {string} baseUrl
 * @param {boolean} useCorsProxy
 * @returns {string}
 */
export function resolveBaseUrl(baseUrl, useCorsProxy) {
  const normalized = String(baseUrl || '').replace(/\/+$/, '')
  if (!normalized) return ''
  if (!shouldUseCorsProxy(useCorsProxy)) return normalized
  return '/api-proxy'
}

/**
 * 合并请求头；开发代理开启时附加 X-Proxy-Target。
 * @param {string} baseUrl 真实上游 Base URL
 * @param {boolean} useCorsProxy
 * @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
export function proxyHeaders(baseUrl, useCorsProxy, extra = {}) {
  const headers = {...extra}
  if (shouldUseCorsProxy(useCorsProxy)) {
    headers['X-Proxy-Target'] = String(baseUrl || '').replace(/\/+$/, '')
  }
  return headers
}

/**
 * 从任意错误中取出短文案，禁止序列化含 headers/config 的整包对象
 * @param {unknown} error
 * @returns {string}
 */
export function pickErrorText(error) {
  if (error == null) return ''
  if (typeof error === 'string') return error.trim()
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }
  if (typeof error?.code === 'string' && error.code.trim()) {
    return error.code.trim()
  }
  const status = error?.response?.status || error?.status
  if (status) return `HTTP ${status}`
  return ''
}

/**
 * 将网络类错误格式化为面向用户的中文提示（区分 Tauri / 代理 / CORS）。
 * @param {unknown} error
 * @param {boolean} useCorsProxy
 * @returns {string}
 */
export function formatNetworkError(error, useCorsProxy) {
  const msg = pickErrorText(error) || '网络请求失败'
  const code = String(error?.code || '')
  const isNetwork =
    msg === 'Network Error' ||
    msg === '网络请求失败' ||
    msg === 'Error' ||
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    msg.includes('Failed to fetch') ||
    msg.includes('ERR_FAILED') ||
    msg.includes('NetworkError') ||
    msg.includes('error sending request') ||
    msg.includes('tcp connect error') ||
    msg.includes('dns error') ||
    msg.includes('timeout')

  if (!isNetwork) return msg

  const viaProxy = shouldUseCorsProxy(useCorsProxy)

  // 主动取消不应当成超时文案（由上层识别 AbortError）
  if (code === 'ERR_CANCELED' || /cancel+ed|已取消/i.test(msg)) {
    return msg || '已取消'
  }
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(msg)) {
    return '请求超时：生图可能需数秒到数分钟，请稍后重试；Agnes 建议客户端超时 60s–360s'
  }
  const detail =
    msg &&
    msg !== 'Network Error' &&
    msg !== '网络请求失败' &&
    msg !== 'Error' &&
    !/^HTTP\s+\d+$/i.test(msg)
      ? `（${msg.length > 160 ? `${msg.slice(0, 160)}…` : msg}）`
      : ''
  if (isTauri()) {
    return `网络失败：请检查 Base URL、API Key、上游服务是否可达，以及本机网络/证书（桌面端已走 Rust HTTP，与浏览器 CORS 无关）${detail}`
  }
  if (import.meta.env.DEV && !viaProxy) {
    return '网络失败（多为 CORS）。请在设置中开启「开发代理」，或改用 npm run tauri:dev'
  }
  if (import.meta.env.DEV && viaProxy) {
    return '网络失败：开发代理已开启仍失败，请检查 Base URL / 服务是否可达 / 证书'
  }
  return '网络失败：请检查 Base URL、网络，或确认接口是否允许浏览器跨域'
}
