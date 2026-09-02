import axios from 'axios'
import {appFetch} from '@core/utils/http'
import {formatNetworkError, isTauri, proxyHeaders, resolveBaseUrl} from '@core/utils/request'
import {API_TIMEOUT_MS} from '@core/utils/constants'
import {
  extractApiErrorMessage,
  httpStatusErrorMessage,
  isAbortLike,
  sanitizeErrorText,
  toAbortError,
  toErrorMessage,
} from './errors.js'

export function authHeaders(apiKey, extra = {}) {
  const key = String(apiKey || '').trim()
  const headers = {...extra}
  if (key) {
    headers.Authorization = `Bearer ${key}`
    // 部分中转站只认 x-api-key；与 Bearer 一并带上提高兼容性
    headers['x-api-key'] = key
  }
  return headers
}

export function buildAxiosConfig(provider) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const config = {
    baseURL: resolveBaseUrl(provider.baseUrl, useCorsProxy),
    timeout: API_TIMEOUT_MS,
    headers: proxyHeaders(
      provider.baseUrl,
      useCorsProxy,
      authHeaders(provider.apiKey, {
        'Content-Type': 'application/json',
      }),
    ),
  }

  // 桌面端：axios 走 Tauri Rust HTTP，不受 WebView CORS 限制
  if (isTauri()) {
    config.adapter = 'fetch'
    config.env = {
      fetch: appFetch,
      Request,
      Response,
      Headers,
    }
  }

  return config
}

/**
 * 创建带鉴权与错误归一化的 axios 实例（JSON 请求）。
 * @param {ProviderSettings} provider
 * @returns {import('axios').AxiosInstance}
 */
export function createApiClient(provider) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const client = axios.create(buildAxiosConfig(provider))

  client.interceptors.response.use(
    (res) => res,
    (error) => {
      // 取消必须原样抛出，否则上层无法识别停止
      if (isAbortLike(error, error?.config?.signal)) {
        return Promise.reject(toAbortError())
      }
      const status = error.response?.status
      const data = error.response?.data
      const fromBody = extractApiErrorMessage(data) || (typeof data === 'string' ? data : '')
      let msg = ''
      if (status) {
        msg = httpStatusErrorMessage(status, fromBody) || fromBody
      } else {
        msg = formatNetworkError(error, useCorsProxy) || fromBody
      }
      msg = sanitizeErrorText(msg, '') || '请求失败，请稍后重试'
      const wrapped = new Error(msg)
      wrapped.status = status
      wrapped.response = error.response
      wrapped.code = error.code
      return Promise.reject(wrapped)
    },
  )

  return client
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function postMultipart(provider, path, form, signal, timeout = API_TIMEOUT_MS) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)
  let res
  try {
    res = await appFetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: proxyHeaders(provider.baseUrl, useCorsProxy, authHeaders(provider.apiKey)),
      body: form,
      signal,
      connectTimeout: timeout,
    })
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(formatNetworkError(error, useCorsProxy) || toErrorMessage(error))
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = await res.json()
      message = extractApiErrorMessage(err) || message
    } catch {
      // ignore
    }
    throw new Error(httpStatusErrorMessage(res.status, message) || message)
  }

  return res.json()
}

export async function getJsonByUrl(provider, url, signal) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  let res
  try {
    res = await appFetch(url, {
      method: 'GET',
      headers: proxyHeaders(provider.baseUrl, useCorsProxy, authHeaders(provider.apiKey)),
      signal,
      connectTimeout: API_TIMEOUT_MS,
    })
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(formatNetworkError(error, useCorsProxy) || toErrorMessage(error))
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = await res.json()
      message = extractApiErrorMessage(err) || message
    } catch {
      // ignore
    }
    throw new Error(httpStatusErrorMessage(res.status, message) || message)
  }
  return res.json()
}
