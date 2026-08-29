import axios from 'axios'
import {appFetch} from '@core/utils/http'
import {compressImageFile} from '@core/utils/imageCompress'
import {formatNetworkError, isTauri, proxyHeaders, resolveBaseUrl} from '@core/utils/request'
import {API_TIMEOUT_MS, DEFAULT_TEMPERATURE} from '@core/utils/constants'
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

function extractVideoUrl(data) {
  if (!data || typeof data !== 'object') return ''
  return (
    data.url ||
    data.video_url ||
    data.videoUrl ||
    data.metadata?.url ||
    data.video?.url ||
    data.output?.url ||
    data.result?.url ||
    ''
  )
}

function extractVideoJobId(data) {
  if (!data || typeof data !== 'object') return ''
  // Agnes 2.5：轮询应优先使用 video_id，而非 task id
  return String(
    data.video_id ||
      data.videoId ||
      data.id ||
      data.job_id ||
      data.jobId ||
      data.request_id ||
      data.requestId ||
      data.task_id ||
      data.taskId ||
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
export async function createVideoJob(provider, options = {}) {
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')
  const {signal} = options
  const prepared = await prepareCreateVideoJob(provider, options, {
    compressImageFile,
    fileToDataUrl,
  })

  let data
  if (prepared.transport === 'multipart') {
    data = await postMultipart(provider, prepared.path, prepared.form, signal, API_TIMEOUT_MS)
  } else {
    const client = createApiClient(provider)
    ;({data} = await client.post(prepared.path, prepared.body, {signal}))
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

  return job
}

/**
 * 轮询直至任务完成或失败。
 * @param {ProviderSettings} provider
 * @param {string} jobId
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(job: VideoJob) => void} [options.onProgress]
 * @param {number} [options.intervalMs=5000] 轮询间隔（至少 1000ms）
 * @param {boolean} [options.fetchContent=true]
 * @returns {Promise<VideoJob>}
 */
export async function waitVideoJob(provider, jobId, options = {}) {
  const {signal, onProgress, intervalMs = 5000, fetchContent = true} = options
  const interval = Math.max(1000, Number(intervalMs) || 5000)

  while (true) {
    if (signal?.aborted) {
      const err = new Error('已取消')
      err.name = 'AbortError'
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
  const {signal, onProgress, intervalMs, ...createOpts} = options
  const created = await createVideoJob(provider, {...createOpts, signal})
  onProgress?.(created)
  if (created.status === 'completed' || created.status === 'failed') {
    if (created.status === 'completed' && !created.videoUrl && shouldFetchVideoContent(provider)) {
      return waitVideoJob(provider, created.jobId, {signal, onProgress, intervalMs})
    }
    return created
  }
  if (!created.jobId) throw new Error('未返回任务 ID')
  return waitVideoJob(provider, created.jobId, {signal, onProgress, intervalMs})
}
