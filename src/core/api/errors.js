export const HTTP_413_HINT =
  '上传内容过大（HTTP 413）。请换更小的参考图，或已自动压缩仍失败则换图重试。'

const MAX_ERROR_TEXT_LEN = 240

/** 统一识别取消：浏览器 AbortError、axios canceled、Tauri plugin-http「Request cancelled/canceled」 */
export function isAbortLike(error, signal) {
  if (signal?.aborted) return true
  if (error?.name === 'AbortError') return true
  if (error?.code === 'ERR_CANCELED') return true
  const msg = String(error?.message || error || '')
  return /cancel+ed|aborted|已取消/i.test(msg)
}

export function toAbortError() {
  const err = new Error('已取消')
  err.name = 'AbortError'
  return err
}

/** 脱敏密钥 / 截断过长文案，避免把 Axios 整包或 Token 展示到 UI */
export function sanitizeErrorText(text, fallback = '') {
  let s = String(text || '').trim()
  if (!s || s === 'undefined' || s === '[object Object]' || s === 'Error') {
    return fallback
  }
  // 已是整包序列化的请求错误：不要展示
  if (
    (s.startsWith('{') && /"config"\s*:|"headers"\s*:|"stack"\s*:/.test(s)) ||
    /Bearer\s+sk-|x-api-key/i.test(s)
  ) {
    return fallback || '请求失败，请稍后重试'
  }
  s = s
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key["']?\s*[:=]\s*["']?)[A-Za-z0-9._\-]+/gi, '$1***')
  if (s.length > MAX_ERROR_TEXT_LEN) {
    s = `${s.slice(0, MAX_ERROR_TEXT_LEN)}…`
  }
  return s
}

export function extractApiErrorMessage(data) {
  if (data == null) return ''
  if (typeof data === 'string') return data.trim()
  if (typeof data !== 'object') return String(data)
  // Axios / 请求对象：禁止整包 stringify（会泄露 Authorization）
  if (data.config || data.headers || data.request || data.stack) return ''
  if (typeof data.error === 'string') return data.error
  if (typeof data.error?.message === 'string') return data.error.message
  if (typeof data.error?.code === 'string' && !data.error?.message) {
    return data.error.code
  }
  if (typeof data.message === 'string') return data.message
  if (typeof data.msg === 'string') return data.msg
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail) && data.detail[0]?.msg) {
    return String(data.detail[0].msg)
  }
  try {
    const json = JSON.stringify(data)
    if (!json || json === '{}' || json.length > 400) return ''
    return json
  } catch {
    return ''
  }
}

/** 将 HTTP 状态与响应体整理为可读错误文案 */
export function httpStatusErrorMessage(status, bodyMessage = '') {
  if (status === 413) return HTTP_413_HINT
  const fromBody = sanitizeErrorText(bodyMessage, '')
  if (
    fromBody &&
    !/^HTTP\s*413\b/i.test(fromBody) &&
    !/payload too large|request entity too large/i.test(fromBody)
  ) {
    return fromBody
  }
  if (status === 413 || /payload too large|request entity too large/i.test(fromBody)) {
    return HTTP_413_HINT
  }
  if (status === 401 || status === 403) return '鉴权失败，请检查 API Key'
  if (status === 404) return '接口不存在（404），请核对 Base URL 与模型'
  if (status === 429) return '请求过于频繁，请稍后重试'
  if (status === 400) return fromBody || '请求参数有误（400）'
  if (status && status >= 500) return `上游服务异常（${status}）`
  return fromBody || (status ? `HTTP ${status}` : '')
}

/**
 * 将任意抛出值转为可读错误文案（脱敏密钥、截断过长文本、映射常见 HTTP 状态）。
 * @param {unknown} error
 * @param {string} [fallback='未知错误']
 * @returns {string}
 */
export function toErrorMessage(error, fallback = '未知错误') {
  if (error == null) return fallback
  if (typeof error === 'string') {
    return sanitizeErrorText(error, fallback) || fallback
  }

  const status = error?.status || error?.response?.status
  const data = error?.response?.data
  const fromResponse = httpStatusErrorMessage(
    status,
    extractApiErrorMessage(data) || (typeof data === 'string' ? data : ''),
  )
  if (fromResponse) return sanitizeErrorText(fromResponse, fallback) || fallback

  if (error instanceof Error) {
    const msg = sanitizeErrorText(error.message, '')
    if (msg) return msg
  }

  if (typeof error === 'object') {
    const fromFields = sanitizeErrorText(
      extractApiErrorMessage(error) ||
        (typeof error.message === 'string' ? error.message : '') ||
        (typeof error.error === 'string' ? error.error : ''),
      '',
    )
    if (fromFields) return fromFields
  }

  return fallback
}
