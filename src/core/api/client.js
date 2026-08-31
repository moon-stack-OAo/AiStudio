import axios from 'axios'
import {appFetch} from '@core/utils/http'
import {compressImageFile} from '@core/utils/imageCompress'
import {formatNetworkError, isTauri, proxyHeaders, resolveBaseUrl} from '@core/utils/request'
import {API_TIMEOUT_MS, DEFAULT_TEMPERATURE, VIDEO_DOWNLOAD_TIMEOUT_MS} from '@core/utils/constants'
import {prepareEditImage, prepareGenerateImage} from '@core/providers/adapters/image'
import {
  prepareCreateVideoJob,
  preparePollVideoJob,
  shouldFetchVideoContent,
} from '@core/providers/adapters/video'

/**
 * OpenAI 兼容 API 客户端：对话、生图、视频任务与连通性探测。
 * 按 provider 配置鉴权与代理；桌面端走 Tauri HTTP，浏览器开发态可走 CORS 代理。
 *
 * @typedef {object} ProviderSettings
 * @property {string} [id] 本地提供商 ID
 * @property {string} [name] 显示名
 * @property {string} baseUrl API Base URL（通常含 /v1）
 * @property {string} [apiKey] API Key
 * @property {string} [chatModel] 对话模型
 * @property {string} [imageModel] 生图模型
 * @property {string} [videoModel] 视频模型
 * @property {string} [provider] 内置类型：openai | xai | openai-compatible 等
 * @property {boolean} [builtin] 是否内置预设
 * @property {boolean} [useCorsProxy] 浏览器开发态是否走 Vite CORS 代理
 *
 * @typedef {object} ChatMessage
 * @property {'system'|'user'|'assistant'|string} role
 * @property {string|Array<object>} content
 *
 * @typedef {object} ImageResult
 * @property {'b64'|'url'} type
 * @property {string} src 可展示的 data URL 或远程 URL
 * @property {string} [revisedPrompt]
 *
 * @typedef {object} VideoJob
 * @property {string} jobId
 * @property {'queued'|'in_progress'|'completed'|'failed'|string} status
 * @property {number} [progress]
 * @property {string} [videoUrl]
 * @property {string} [remoteVideoUrl] 原始 http(s) 地址，供 blob 失效后重新加载
 * @property {boolean} [needsMaterialize] materialize 失败时为 true，UI 可提示重新加载
 * @property {string} [errorMessage]
 * @property {object} [raw] 上游原始响应
 */

export {
  getCapabilities,
  resolveProfile,
  supportsImageQuality,
  isAgnesProvider,
  isAgnesImage21,
  isAgnesVideoFlash,
  normalizeAgnesVideoSize,
  normalizeAgnesImageSize20,
  normalizeAgnesImageSize,
  normalizeAgnesImageRatio,
  buildAgnesImageSizeFields,
} from '@core/providers'

const HTTP_413_HINT = '上传内容过大（HTTP 413）。请换更小的参考图，或已自动压缩仍失败则换图重试。'

const MAX_ERROR_TEXT_LEN = 240

/** 统一识别取消：浏览器 AbortError、axios canceled、Tauri plugin-http「Request cancelled/canceled」 */
function isAbortLike(error, signal) {
  if (signal?.aborted) return true
  if (error?.name === 'AbortError') return true
  if (error?.code === 'ERR_CANCELED') return true
  const msg = String(error?.message || error || '')
  return /cancel+ed|aborted|已取消/i.test(msg)
}

function toAbortError() {
  const err = new Error('已取消')
  err.name = 'AbortError'
  return err
}

/** 脱敏密钥 / 截断过长文案，避免把 Axios 整包或 Token 展示到 UI */
function sanitizeErrorText(text, fallback = '') {
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

function extractApiErrorMessage(data) {
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
function httpStatusErrorMessage(status, bodyMessage = '') {
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

function authHeaders(apiKey, extra = {}) {
  const key = String(apiKey || '').trim()
  const headers = {...extra}
  if (key) {
    headers.Authorization = `Bearer ${key}`
    // 部分中转站只认 x-api-key；与 Bearer 一并带上提高兼容性
    headers['x-api-key'] = key
  }
  return headers
}

function buildAxiosConfig(provider) {
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

/**
 * 拉取提供商模型列表（OpenAI 兼容 GET /models）
 * @param {ProviderSettings} provider
 * @returns {Promise<Array<{ id: string, ownedBy?: string }>>}
 */
export async function listProviderModels(provider) {
  if (!provider?.baseUrl) {
    throw new Error('请先填写 Base URL')
  }
  const client = createApiClient(provider)
  const {data} = await client.get('/models', {timeout: 20000})
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
  return list
    .map((item) => {
      if (typeof item === 'string') return {id: item}
      const id = item?.id || item?.name
      if (!id) return null
      return {
        id: String(id),
        ownedBy: item?.owned_by ? String(item.owned_by) : '',
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id))
}

function describeHttpProbeError(err, fallback) {
  const status = err?.status || err?.response?.status
  const raw = toErrorMessage(err, '')
  if (
    status === 401 ||
    status === 403 ||
    /unauthorized|invalid.?api.?key|incorrect.?api/i.test(raw)
  ) {
    return '鉴权失败（401/403），请检查 API Key'
  }
  if (status === 404 || /\b404\b|not\s*found/i.test(raw)) {
    return '接口不存在（404），请核对 Base URL 是否含 /v1 等路径'
  }
  if (status === 429 || /rate.?limit|too many requests/i.test(raw)) {
    return '请求过于频繁（429），请稍后重试'
  }
  if (status && status >= 500) {
    return `上游服务异常（${status}）`
  }
  return raw || fallback
}

/**
 * 测试提供商连通性：优先 GET /models，失败再试最小 chat（需已配置 chatModel）
 * @param {ProviderSettings} provider
 * @returns {Promise<{ ok: true, detail: string }>}
 * @throws {Error} 模型列表与 chat 均不可达时抛出合并说明
 */
export async function testProviderConnection(provider) {
  if (!provider?.baseUrl) {
    throw new Error('请先填写 Base URL')
  }
  try {
    const models = await listProviderModels(provider)
    return {
      ok: true,
      detail: `可达，模型列表约 ${models.length} 个`,
    }
  } catch (modelsErr) {
    const chatModel = String(provider?.chatModel || '').trim()
    if (!chatModel) {
      throw new Error(
        describeHttpProbeError(modelsErr, '模型列表不可达；未配置对话模型，无法回退探测 chat'),
      )
    }
    try {
      const client = createApiClient(provider)
      await client.post(
        '/chat/completions',
        {
          model: chatModel,
          messages: [{role: 'user', content: 'ping'}],
          max_tokens: 1,
          stream: false,
        },
        {timeout: 30000},
      )
      return {ok: true, detail: '对话接口可达（模型列表不可用，已用 chat 探测）'}
    } catch (chatErr) {
      const modelsHint = describeHttpProbeError(modelsErr, '模型列表失败')
      const chatHint = describeHttpProbeError(chatErr, '对话接口失败')
      throw new Error(`连接失败：${chatHint}（模型列表：${modelsHint}）`)
    }
  }
}

/**
 * 非流式对话补全（POST /chat/completions）
 * @param {ProviderSettings} provider
 * @param {object} options
 * @param {ChatMessage[]} options.messages
 * @param {boolean} [options.stream=false] 应为 false；流式请用 streamChatCompletions
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.temperature]
 * @param {number} [options.max_tokens] >0 时写入请求体
 * @param {number} [options.timeout] 毫秒；缺省 API_TIMEOUT_MS
 * @returns {Promise<object>} 上游原始响应（含 choices 等）
 */
export async function chatCompletions(
  provider,
  {messages, stream = false, signal, temperature, max_tokens, timeout},
) {
  const client = createApiClient(provider)
  const temp =
    temperature != null && Number.isFinite(Number(temperature))
      ? Number(temperature)
      : DEFAULT_TEMPERATURE
  const body = {
    model: provider.chatModel,
    messages,
    stream,
    temperature: temp,
  }
  const maxTokens = Math.floor(Number(max_tokens))
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = maxTokens
  }
  const reqTimeout =
    timeout != null && Number.isFinite(Number(timeout)) && Number(timeout) > 0
      ? Number(timeout)
      : API_TIMEOUT_MS
  const {data} = await client.post('/chat/completions', body, {signal, timeout: reqTimeout})
  return data
}

/**
 * SSE 流式对话补全；通过 onDelta 增量回调，最终返回完整文本。
 * @param {ProviderSettings} provider
 * @param {object} options
 * @param {ChatMessage[]} options.messages
 * @param {(delta: string, fullText: string) => void} [options.onDelta]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.temperature]
 * @param {number} [options.max_tokens] >0 时写入请求体
 * @param {number} [options.timeout] 毫秒；缺省 API_TIMEOUT_MS
 * @returns {Promise<string>} 拼接后的完整助手文本
 */
export async function streamChatCompletions(
  provider,
  {messages, onDelta, signal, temperature, max_tokens, timeout},
) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)
  if (!provider?.chatModel) {
    throw new Error('请先设置对话模型')
  }
  const temp =
    temperature != null && Number.isFinite(Number(temperature))
      ? Number(temperature)
      : DEFAULT_TEMPERATURE
  const body = {
    model: provider.chatModel,
    messages,
    stream: true,
    temperature: temp,
  }
  const maxTokens = Math.floor(Number(max_tokens))
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = maxTokens
  }
  const connectTimeout =
    timeout != null && Number.isFinite(Number(timeout)) && Number(timeout) > 0
      ? Number(timeout)
      : API_TIMEOUT_MS

  let res
  try {
    res = await appFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: proxyHeaders(
        provider.baseUrl,
        useCorsProxy,
        authHeaders(provider.apiKey, {
          'Content-Type': 'application/json',
        }),
      ),
      body: JSON.stringify(body),
      signal,
      connectTimeout,
    })
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(formatNetworkError(error, useCorsProxy) || toErrorMessage(error))
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const text = await res.text()
      try {
        message = extractApiErrorMessage(JSON.parse(text)) || message
      } catch {
        if (text?.trim()) message = text.trim().slice(0, 300)
      }
    } catch {
      // ignore
    }
    throw new Error(httpStatusErrorMessage(res.status, message) || message)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('当前环境不支持流式响应')

  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let fullText = ''

  const onAbort = () => {
    try {
      reader.cancel()
    } catch {
      // ignore
    }
  }
  signal?.addEventListener?.('abort', onAbort, {once: true})
  if (signal?.aborted) onAbort()

  const consumeSseLine = (line) => {
    if (signal?.aborted) return
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    try {
      const json = JSON.parse(payload)
      const streamErr = extractApiErrorMessage(json)
      if (streamErr && (json.error || json.code || !json.choices)) {
        throw new Error(streamErr)
      }
      const choice = json.choices?.[0]
      const delta =
        choice?.delta?.content ||
        choice?.message?.content ||
        (typeof choice?.text === 'string' ? choice.text : '') ||
        ''
      if (delta) {
        fullText += delta
        onDelta?.(delta, fullText)
      }
    } catch (e) {
      if (e instanceof Error && e.message && e.message !== 'Unexpected end of JSON input') {
        // 仅把业务错误往外抛；JSON 解析失败忽略
        if (e.name !== 'SyntaxError') throw e
      }
    }
  }

  try {
    while (true) {
      if (signal?.aborted) throw toAbortError()
      let chunk
      try {
        chunk = await reader.read()
      } catch (error) {
        if (isAbortLike(error, signal)) throw toAbortError()
        throw error
      }
      const {done, value} = chunk
      // Tauri plugin-http 取消后常以 done:true 正常结束，必须主动当成 Abort
      if (signal?.aborted) throw toAbortError()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (signal?.aborted) throw toAbortError()
        consumeSseLine(line)
      }
    }
    if (signal?.aborted) throw toAbortError()
    // flush 解码器残留，再解析循环结束后的 buffer
    buffer += decoder.decode()
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) consumeSseLine(line)
    }
    if (signal?.aborted) throw toAbortError()
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw error
  } finally {
    signal?.removeEventListener?.('abort', onAbort)
    try {
      await reader.cancel()
    } catch {
      // ignore
    }
  }

  return fullText
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function postMultipart(provider, path, form, signal, timeout = API_TIMEOUT_MS) {
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

async function getJsonByUrl(provider, url, signal) {
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

/**
 * 文生图：经 adapter 组装请求后 POST，并归一化为可展示结果列表。
 * @param {ProviderSettings} provider
 * @param {object} options
 * @param {string} options.prompt
 * @param {number} [options.n]
 * @param {string} [options.size] 如 1024x1024
 * @param {string} [options.quality]
 * @param {string} [options.aspectRatio]
 * @param {'b64_json'|'url'|string} [options.responseFormat]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<ImageResult[]>}
 */
export async function generateImage(provider, options) {
  const {signal} = options
  const prepared = await prepareGenerateImage(provider, options)
  const client = createApiClient(provider)
  const {data} = await client.post(prepared.path, prepared.body, {
    signal,
    timeout: prepared.timeout || API_TIMEOUT_MS,
  })
  return normalizeImageResponse(data)
}

/**
 * 图生图 / 编辑：multipart（OpenAI edits）或 JSON（如 Agnes）。
 * @param {ProviderSettings} provider
 * @param {object} options
 * @param {string} options.prompt
 * @param {File|Blob} options.imageFile 参考图
 * @param {number} [options.n]
 * @param {string} [options.size]
 * @param {string} [options.aspectRatio]
 * @param {'b64_json'|'url'|string} [options.responseFormat]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<ImageResult[]>}
 */
export async function editImage(provider, options) {
  const {signal} = options
  const prepared = await prepareEditImage(provider, options, {
    compressImageFile,
    fileToDataUrl,
  })

  if (prepared.transport === 'multipart') {
    const data = await postMultipart(
      provider,
      prepared.path,
      prepared.form,
      signal,
      prepared.timeout || API_TIMEOUT_MS,
    )
    return normalizeImageResponse(data)
  }

  const client = createApiClient(provider)
  const {data} = await client.post(prepared.path, prepared.body, {
    signal,
    timeout: prepared.timeout || API_TIMEOUT_MS,
  })
  return normalizeImageResponse(data)
}

function normalizeImageResponse(data) {
  const list = data?.data || []
  return list.map((item) => {
    if (item.b64_json) {
      return {
        type: 'b64',
        src: `data:image/png;base64,${item.b64_json}`,
        revisedPrompt: item.revised_prompt || '',
      }
    }
    return {
      type: 'url',
      src: item.url,
      revisedPrompt: item.revised_prompt || '',
    }
  })
}

/**
 * 将本地文件转为 data URL，供 UI 预览。
 * @param {File|Blob} file
 * @returns {Promise<string>} data URL
 */
export async function fileToPreview(file) {
  return fileToDataUrl(file)
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('已取消')
      err.name = 'AbortError'
      reject(err)
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      const err = new Error('已取消')
      err.name = 'AbortError'
      reject(err)
    }
    signal?.addEventListener?.('abort', onAbort, {once: true})
  })
}

function normalizeVideoJobStatus(raw) {
  const s = String(raw || '').toLowerCase()
  if (s === 'completed' || s === 'done' || s === 'success' || s === 'succeeded') {
    return 'completed'
  }
  if (s === 'failed' || s === 'expired' || s === 'error' || s === 'cancelled' || s === 'canceled') {
    return 'failed'
  }
  if (s === 'queued' || s === 'pending') return 'queued'
  if (s === 'in_progress' || s === 'processing' || s === 'running') return 'in_progress'
  if (!s) return 'queued'
  return 'in_progress'
}

/**
 * 从上游响应提取可播放 URL。
 * 优先嵌套 video 字段（xAI: data.video.url），避免顶层无关 url 抢先。
 * @param {object} data
 * @returns {string}
 */
/** 是否像可直链播放的绝对媒体地址（非 API /content 相对路径） */
function isDirectPlayableVideoUrl(url) {
  const s = String(url || '').trim()
  if (!/^https?:\/\//i.test(s)) return false
  // 中转常见：.../videos/{id}/content —— 需鉴权拉取，不能直接给 <video>
  if (/\/videos\/[^/]+\/content\/?$/i.test(s) || /\/v1\/videos\/[^/]+\/content\/?$/i.test(s)) {
    return false
  }
  return true
}

/** 是否像 OpenAI/中转的 content 拉流路径（相对或绝对） */
export function isVideoContentPath(url) {
  const s = String(url || '').trim()
  if (!s) return false
  return /(?:^|\/)(?:v1\/)?videos\/[^/]+\/content\/?$/i.test(s.replace(/^https?:\/\/[^/]+/i, ''))
}

/**
 * 从上游响应提取可播放 URL。
 * 优先绝对直链（xAI vidgen）；避开误导性的 /videos/{id}/content。
 * @param {object} data
 * @returns {string}
 */
export function extractVideoUrl(data) {
  if (!data || typeof data !== 'object') return ''
  // 部分中转会再包一层 data
  const root =
    data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data
  const videoObj = root.video && !Array.isArray(root.video) ? root.video : null
  const videoArr0 = Array.isArray(root.video) ? root.video[0] : null

  const candidates = [
    videoObj?.url,
    videoObj?.download_url,
    videoObj?.downloadUrl,
    videoObj?.play_url,
    videoObj?.playUrl,
    root.video_url,
    root.videoUrl,
    videoArr0?.url,
    root.metadata?.url,
    root.output?.url,
    root.result?.url,
    root.url,
    data.video?.url,
    data.url,
    videoObj?.public_url,
    videoObj?.publicUrl,
    root.public_url,
    root.publicUrl,
    videoArr0?.public_url,
  ]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)

  // 1) 绝对直链（可给 <video src>）
  const direct = candidates.find((u) => isDirectPlayableVideoUrl(u))
  if (direct) return direct

  // 2) 任意绝对 http(s)（含 /content，后续由 ensure 拉 blob）
  const absolute = candidates.find((u) => /^https?:\/\//i.test(u))
  if (absolute) return absolute

  // 3) 相对路径（如 /v1/videos/{id}/content）
  return candidates[0] || ''
}

/** 粗检是否像 mp4（....ftyp）；过严会误伤，仅作辅助提示 */
function looksLikeMp4(buf) {
  if (!buf || buf.byteLength < 8) return false
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70
}

/**
 * 用 appFetch 拉取远程视频并转为强制 video/mp4 的 blob: URL。
 * WebView2 对空/octet-stream MIME 的 blob 常直接 @error。
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>} blob: URL
 */
export async function materializeRemoteVideoUrl(url, signal) {
  const src = String(url || '').trim()
  if (!src) throw new Error('缺少视频地址')
  if (src.startsWith('blob:') || src.startsWith('data:')) return src
  if (!/^https?:\/\//i.test(src)) throw new Error('不支持的视频地址')

  const downloadTimeout = Math.max(API_TIMEOUT_MS, VIDEO_DOWNLOAD_TIMEOUT_MS)

  let res
  try {
    res = await appFetch(src, {
      method: 'GET',
      signal,
      connectTimeout: downloadTimeout,
    })
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(formatNetworkError(error, false) || toErrorMessage(error, '下载视频失败'))
  }
  if (!res.ok) {
    throw new Error(
      httpStatusErrorMessage(res.status, `HTTP ${res.status}`) || `HTTP ${res.status}`,
    )
  }

  let buf
  try {
    buf = await res.arrayBuffer()
  } catch (error) {
    if (isAbortLike(error, signal)) throw toAbortError()
    throw new Error(toErrorMessage(error, '读取视频内容失败'))
  }
  if (!buf || buf.byteLength === 0) {
    throw new Error('视频内容为空')
  }
  // 明显 HTML/文本则拒绝；ftyp 仅作软提示，不强制
  const head = new Uint8Array(buf, 0, Math.min(16, buf.byteLength))
  const headStr = String.fromCharCode(...head).trimStart()
  if (headStr.startsWith('<') || headStr.toLowerCase().startsWith('<!doctype')) {
    throw new Error('下载到的不是视频文件')
  }
  if (!looksLikeMp4(buf) && buf.byteLength < 64) {
    throw new Error('视频内容过短或格式异常')
  }

  const blob = new Blob([buf], {type: 'video/mp4'})
  return URL.createObjectURL(blob)
}

/**
 * 把相对/绝对的 /videos/{id}/content 解析成可请求地址。
 * @param {string} url
 * @param {string} [baseUrl]
 */
function resolveVideoContentUrl(url, baseUrl) {
  const src = String(url || '').trim()
  if (!src) return ''
  if (/^https?:\/\//i.test(src)) return src
  const base = String(baseUrl || '').replace(/\/+$/, '')
  if (!base) return src
  if (src.startsWith('/')) return `${base}${src}`
  return `${base}/${src}`
}

/**
 * 完成态规范化播放地址：
 * - 绝对直链（vidgen 等）→ 保留 https，供 <video> 直连
 * - /videos/{id}/content（中转常见）→ 带鉴权拉成 blob:
 * @param {VideoJob} job
 * @param {AbortSignal} [signal]
 * @param {ProviderSettings} [provider]
 * @returns {Promise<VideoJob>}
 */
export async function ensureJobVideoMaterialized(job, signal, provider) {
  if (!job || job.status !== 'completed') return job
  let src = String(job.videoUrl || '').trim()
  if (!src) return job
  if (src.startsWith('blob:') || src.startsWith('data:')) return job

  // 相对 content 路径：拼上 baseUrl
  if (isVideoContentPath(src) || src.startsWith('/')) {
    src = resolveVideoContentUrl(src, provider?.baseUrl)
  }

  // 可直链播放的绝对地址：保留 https
  if (isDirectPlayableVideoUrl(src)) {
    job.remoteVideoUrl = src
    job.videoUrl = src
    job.needsMaterialize = false
    if (job.errorMessage === '视频已生成但本地加载失败') {
      job.errorMessage = undefined
    }
    return job
  }

  // /content 或其它需鉴权地址：拉成 blob
  if (/^https?:\/\//i.test(src) && provider?.baseUrl) {
    try {
      // 若是本 API 的 content 路径，走与 OpenAI 相同的鉴权下载
      if (isVideoContentPath(src) && job.jobId) {
        const blobUrl = await fetchOpenAiVideoContentUrl(provider, job.jobId, signal)
        job.remoteVideoUrl = src
        job.videoUrl = blobUrl
        job.needsMaterialize = false
        return job
      }
      const blobUrl = await materializeRemoteVideoUrl(src, signal)
      job.remoteVideoUrl = isDirectPlayableVideoUrl(src) ? src : job.remoteVideoUrl || ''
      job.videoUrl = blobUrl
      job.needsMaterialize = false
      return job
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      job.videoUrl = src
      job.remoteVideoUrl = job.remoteVideoUrl || src
      job.needsMaterialize = true
      job.errorMessage = toErrorMessage(e, '视频已生成但本地加载失败')
      return job
    }
  }

  // 仍是相对路径且无法解析
  if (!/^https?:\/\//i.test(src)) {
    job.errorMessage = job.errorMessage || `无法解析视频地址: ${src}`
    job.needsMaterialize = true
  }
  return job
}

function extractVideoJobId(data) {
  if (!data || typeof data !== 'object') return ''
  // Agnes：优先 video_id；xAI：优先 request_id。泛化 id 放最后，避免抢错字段
  return String(
    data.video_id ||
      data.videoId ||
      data.request_id ||
      data.requestId ||
      data.job_id ||
      data.jobId ||
      data.task_id ||
      data.taskId ||
      data.id ||
      '',
  )
}

function buildNormalizedVideoJob(data, fallbackId = '') {
  const jobId = extractVideoJobId(data) || String(fallbackId || '')
  const status = normalizeVideoJobStatus(data?.status)
  const progressRaw = data?.progress ?? data?.percent ?? data?.percentage
  const progress =
    typeof progressRaw === 'number' && Number.isFinite(progressRaw) ? progressRaw : undefined
  const videoUrl = extractVideoUrl(data)
  let errorMessage = ''
  if (status === 'failed') {
    errorMessage =
      extractApiErrorMessage(data?.error) ||
      extractApiErrorMessage(data) ||
      (data?.status === 'expired' ? '任务已过期' : '') ||
      '视频生成失败'
  }
  return {
    jobId,
    status,
    progress,
    videoUrl: videoUrl || undefined,
    errorMessage: errorMessage || undefined,
    raw: data,
  }
}

async function fetchOpenAiVideoContentUrl(provider, jobId, signal) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)
  let res
  try {
    res = await appFetch(`${baseUrl}/videos/${encodeURIComponent(jobId)}/content`, {
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
      const text = await res.text()
      try {
        message = extractApiErrorMessage(JSON.parse(text)) || message
      } catch {
        if (text?.trim()) message = text.trim().slice(0, 300)
      }
    } catch {
      // ignore
    }
    throw new Error(httpStatusErrorMessage(res.status, message) || message)
  }
  const blob = await res.blob()
  if (!blob || blob.size === 0) {
    throw new Error('视频内容为空')
  }
  return URL.createObjectURL(blob)
}

/**
 * 创建视频生成任务（文生 / 图生）
 * @param {ProviderSettings} provider
 * @param {object} [options]
 * @param {string} [options.prompt]
 * @param {'txt2video'|'img2video'|string} [options.mode='txt2video']
 * @param {File|Blob} [options.imageFile] 图生视频参考图
 * @param {number|string} [options.seconds]
 * @param {number|string} [options.duration] 与 seconds 二选一
 * @param {string} [options.size]
 * @param {string} [options.aspectRatio]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<VideoJob>}
 */
function isHttp413Error(error) {
  const status = error?.response?.status ?? error?.status
  if (status === 413) return true
  const msg = String(error?.message || '')
  return /HTTP\s*413|payload too large|request entity too large/i.test(msg)
}

async function postPreparedVideoCreate(provider, prepared, signal) {
  if (prepared.transport === 'multipart') {
    return postMultipart(provider, prepared.path, prepared.form, signal, API_TIMEOUT_MS)
  }
  const client = createApiClient(provider)
  const {data} = await client.post(prepared.path, prepared.body, {signal})
  return data
}

export async function createVideoJob(provider, options = {}) {
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')
  const {signal} = options
  const deps = {compressImageFile, fileToDataUrl}
  let prepared = await prepareCreateVideoJob(provider, options, deps)

  let data
  try {
    data = await postPreparedVideoCreate(provider, prepared, signal)
  } catch (error) {
    if (signal?.aborted || isAbortLike(error, signal)) throw toAbortError()
    // 图生（JSON / multipart）413：更激进压缩后重试一次
    if (
      options.mode === 'img2video' &&
      options.imageFile &&
      !options._aggressiveCompress &&
      isHttp413Error(error)
    ) {
      prepared = await prepareCreateVideoJob(
        provider,
        {...options, _aggressiveCompress: true},
        deps,
      )
      try {
        data = await postPreparedVideoCreate(provider, prepared, signal)
      } catch (retryErr) {
        if (signal?.aborted || isAbortLike(retryErr, signal)) throw toAbortError()
        if (isHttp413Error(retryErr)) {
          throw new Error(HTTP_413_HINT)
        }
        throw retryErr
      }
    } else if (isHttp413Error(error)) {
      throw new Error(HTTP_413_HINT)
    } else {
      throw error
    }
  }

  const job = buildNormalizedVideoJob(data)
  if (prepared.requireJobId && !job.jobId) {
    throw new Error(prepared.missingJobIdMessage || '未返回任务 ID')
  }
  if (prepared.defaultQueuedIfEmpty && (!job.status || job.status === 'queued')) {
    job.status = 'queued'
  }
  return job
}

/**
 * 查询视频任务状态；OpenAI 兼容完成且无 url 时尝试拉取 /content。
 * @param {ProviderSettings} provider
 * @param {string} jobId
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.fetchContent=true] 是否允许补拉视频二进制内容
 * @returns {Promise<VideoJob>}
 */
export async function getVideoJob(provider, jobId, options = {}) {
  const id = String(jobId || '').trim()
  if (!id) throw new Error('缺少任务 ID')
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')

  const {signal, fetchContent = true} = options
  const prepared = preparePollVideoJob(provider, id, {resolveBaseUrl})

  let data
  if (prepared.style === 'agnesapi') {
    data = await getJsonByUrl(provider, prepared.url, signal)
  } else {
    const client = createApiClient(provider)
    ;({data} = await client.get(prepared.path, {signal}))
  }

  const job = buildNormalizedVideoJob(data, id)

  const allowContent = fetchContent && prepared.fetchContent && shouldFetchVideoContent(provider)

  if (allowContent && job.status === 'completed' && !job.videoUrl) {
    try {
      job.videoUrl = await fetchOpenAiVideoContentUrl(provider, id, signal)
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      job.errorMessage = toErrorMessage(e, '下载视频内容失败')
    }
  }

  // 完成态：直链保留 https；/content 相对路径带鉴权拉成 blob
  if (job.status === 'completed' && job.videoUrl) {
    await ensureJobVideoMaterialized(job, signal, provider)
  }

  // 完成但没有任何 url：对 content 型 API 再尝试拉二进制
  if (job.status === 'completed' && !job.videoUrl && job.jobId && provider?.baseUrl) {
    try {
      job.videoUrl = await fetchOpenAiVideoContentUrl(provider, job.jobId, signal)
      job.needsMaterialize = false
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      // 保留原错误；上层会标失败
      if (!job.errorMessage) job.errorMessage = toErrorMessage(e, '下载视频内容失败')
    }
  }

  return job
}

/** 视频任务默认轮询超时（30 分钟） */
export const VIDEO_JOB_DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

/**
 * 轮询直至任务完成或失败。
 * @param {ProviderSettings} provider
 * @param {string} jobId
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(job: VideoJob) => void} [options.onProgress]
 * @param {number} [options.intervalMs=5000] 轮询间隔（至少 1000ms）
 * @param {number} [options.timeoutMs=VIDEO_JOB_DEFAULT_TIMEOUT_MS] 总超时；<=0 表示不限
 * @param {boolean} [options.fetchContent=true]
 * @returns {Promise<VideoJob>}
 */
export async function waitVideoJob(provider, jobId, options = {}) {
  const {
    signal,
    onProgress,
    intervalMs = 5000,
    timeoutMs = VIDEO_JOB_DEFAULT_TIMEOUT_MS,
    fetchContent = true,
  } = options
  const interval = Math.max(1000, Number(intervalMs) || 5000)
  const limit =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs)
      ? timeoutMs
      : VIDEO_JOB_DEFAULT_TIMEOUT_MS
  const startedAt = Date.now()

  while (true) {
    if (signal?.aborted) {
      const err = new Error('已取消')
      err.name = 'AbortError'
      throw err
    }
    if (limit > 0 && Date.now() - startedAt >= limit) {
      const err = new Error('视频生成超时，可稍后在会话中恢复轮询')
      err.name = 'TimeoutError'
      err.code = 'VIDEO_JOB_TIMEOUT'
      throw err
    }
    const job = await getVideoJob(provider, jobId, {signal, fetchContent})
    onProgress?.(job)
    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }
    await sleep(interval, signal)
  }
}

/**
 * 创建视频任务并等待完成（或立即返回已终态结果）。
 * @param {ProviderSettings} provider
 * @param {object} [options] 同 createVideoJob，另含轮询选项
 * @param {AbortSignal} [options.signal]
 * @param {(job: VideoJob) => void} [options.onProgress]
 * @param {number} [options.intervalMs]
 * @returns {Promise<VideoJob>}
 */
export async function generateVideo(provider, options = {}) {
  const {signal, onProgress, intervalMs, timeoutMs, ...createOpts} = options
  const created = await createVideoJob(provider, {...createOpts, signal})
  onProgress?.(created)
  if (created.status === 'completed' || created.status === 'failed') {
    if (created.status === 'completed' && !created.videoUrl && shouldFetchVideoContent(provider)) {
      return waitVideoJob(provider, created.jobId, {signal, onProgress, intervalMs, timeoutMs})
    }
    // 创建接口直接返回完成时也规范化播放地址
    if (created.status === 'completed' && created.videoUrl) {
      await ensureJobVideoMaterialized(created, signal, provider)
    }
    return created
  }
  if (!created.jobId) throw new Error('未返回任务 ID')
  return waitVideoJob(provider, created.jobId, {signal, onProgress, intervalMs, timeoutMs})
}
