import axios from 'axios'
import {appFetch} from '@core/utils/http'
import {compressImageFile} from '@core/utils/imageCompress'
import {formatNetworkError, isTauri, proxyHeaders, resolveBaseUrl,} from '@core/utils/request'
import {API_TIMEOUT_MS, DEFAULT_TEMPERATURE} from '@core/utils/constants'

const HTTP_413_HINT =
  '上传内容过大（HTTP 413）。请换更小的参考图，或已自动压缩仍失败则换图重试。'

const MAX_ERROR_TEXT_LEN = 240

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
  if (fromBody && !/^HTTP\s*413\b/i.test(fromBody) && !/payload too large|request entity too large/i.test(fromBody)) {
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

/** 将任意抛出值转为可读错误文案 */
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
  const headers = { ...extra }
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

export function createApiClient(provider) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const client = axios.create(buildAxiosConfig(provider))

  client.interceptors.response.use(
    (res) => res,
    (error) => {
      const status = error.response?.status
      const data = error.response?.data
      const fromBody =
        extractApiErrorMessage(data) ||
        (typeof data === 'string' ? data : '')
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
 * 拉取提供商模型列表（OpenAI 兼容 /models）
 * @returns {Promise<Array<{ id: string, ownedBy?: string }>>}
 */
export async function listProviderModels(provider) {
  if (!provider?.baseUrl) {
    throw new Error('请先填写 Base URL')
  }
  const client = createApiClient(provider)
  const { data } = await client.get('/models', { timeout: 20000 })
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
  return list
    .map((item) => {
      if (typeof item === 'string') return { id: item }
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
  if (status === 401 || status === 403 || /unauthorized|invalid.?api.?key|incorrect.?api/i.test(raw)) {
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
 * @returns {Promise<{ ok: true, detail: string }>}
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
        describeHttpProbeError(
          modelsErr,
          '模型列表不可达；未配置对话模型，无法回退探测 chat',
        ),
      )
    }
    try {
      const client = createApiClient(provider)
      await client.post(
        '/chat/completions',
        {
          model: chatModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        },
        { timeout: 30000 },
      )
      return { ok: true, detail: '对话接口可达（模型列表不可用，已用 chat 探测）' }
    } catch (chatErr) {
      const modelsHint = describeHttpProbeError(modelsErr, '模型列表失败')
      const chatHint = describeHttpProbeError(chatErr, '对话接口失败')
      throw new Error(`连接失败：${chatHint}（模型列表：${modelsHint}）`)
    }
  }
}

export async function chatCompletions(provider, { messages, stream = false, signal }) {
  const client = createApiClient(provider)
  const { data } = await client.post(
    '/chat/completions',
    {
      model: provider.chatModel,
      messages,
      stream,
      temperature: DEFAULT_TEMPERATURE,
    },
    { signal },
  )
  return data
}

export async function streamChatCompletions(provider, { messages, onDelta, signal }) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)
  if (!provider?.chatModel) {
    throw new Error('请先设置对话模型')
  }

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
      body: JSON.stringify({
        model: provider.chatModel,
        messages,
        stream: true,
        temperature: DEFAULT_TEMPERATURE,
      }),
      signal,
      connectTimeout: API_TIMEOUT_MS,
    })
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      const abortErr = new Error('已取消')
      abortErr.name = 'AbortError'
      throw abortErr
    }
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

  const consumeSseLine = (line) => {
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
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) consumeSseLine(line)
    }
    // flush 解码器残留，再解析循环结束后的 buffer
    buffer += decoder.decode()
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) consumeSseLine(line)
    }
  } finally {
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

/** 是否向生图接口附带 quality（自定义中转一律不传，避免队列拒参） */
export function supportsImageQuality(provider) {
  // 自定义提供商（含 Agnes 等中转）一律不传
  if (!provider?.builtin) return false
  const kind = String(provider?.provider || '')
  const model = String(provider?.imageModel || '').toLowerCase()
  if (kind === 'openai') return true
  if (kind === 'xai') {
    return model.includes('imagine-image-2') || model.includes('2.0')
  }
  return false
}

/** Agnes APIHub：特殊请求体（禁止顶层 response_format） */
export function isAgnesProvider(provider) {
  const base = String(provider?.baseUrl || '').toLowerCase()
  const imageModel = String(provider?.imageModel || '').toLowerCase()
  const videoModel = String(provider?.videoModel || '').toLowerCase()
  return (
    base.includes('agnes-ai.com') ||
    imageModel.includes('agnes-image') ||
    videoModel.includes('agnes-video') ||
    videoModel.includes('agnes-')
  )
}

/** Agnes Video 2.5：size 档位 */
const AGNES_VIDEO_SIZES = ['720P', '960P', '2K']

/** Flash 仅支持 720P */
export function isAgnesVideoFlash(provider) {
  return String(provider?.videoModel || '')
    .toLowerCase()
    .includes('flash')
}

export function normalizeAgnesVideoSize(size, provider) {
  if (isAgnesVideoFlash(provider)) return '720P'
  const raw = String(size || '').trim()
  if (!raw) return '720P'
  const upper = raw.toUpperCase()
  if (AGNES_VIDEO_SIZES.includes(upper)) return upper
  if (upper === '720' || upper === '720P') return '720P'
  if (upper === '960' || upper === '960P') return '960P'
  if (upper === '2K' || upper === '1080P' || upper === '1080') return '2K'
  // WxH：Agnes 档位按短边/档名，1280x720 对应 720P（勿误判为 960P）
  const m = raw.toLowerCase().match(/^(\d+)\s*x\s*(\d+)$/)
  if (m) {
    const w = Number(m[1])
    const h = Number(m[2])
    const long = Math.max(w, h)
    if (long >= 1800) return '2K'
    if (long > 1280) return '960P'
    return '720P'
  }
  return '720P'
}

function clampAgnesVideoSeconds(seconds, duration) {
  const n = Number(seconds ?? duration)
  if (!Number.isFinite(n)) return '5'
  const clamped = Math.min(12, Math.max(4, Math.round(n)))
  return String(clamped)
}

/** Agnes 查询接口在网关根路径 /agnesapi，不在 /v1 下 */
function resolveAgnesApiHubRoot(baseUrl, useCorsProxy) {
  const resolved = resolveBaseUrl(baseUrl, useCorsProxy)
  return String(resolved || '')
    .replace(/\/+$/, '')
    .replace(/\/v1$/i, '')
}

const AGNES_SIZES = ['1024x1024', '1024x768', '768x1024']

/** 将 UI 尺寸映射为 Agnes 支持的 WxH */
export function normalizeAgnesImageSize(size) {
  const s = String(size || '').toLowerCase()
  if (AGNES_SIZES.includes(s)) return s
  const m = s.match(/^(\d+)\s*x\s*(\d+)$/)
  if (!m) return '1024x1024'
  const w = Number(m[1])
  const h = Number(m[2])
  if (!w || !h) return '1024x1024'
  const ratio = w / h
  if (Math.abs(ratio - 1) < 0.08) return '1024x1024'
  if (ratio > 1) return '1024x768'
  return '768x1024'
}

export async function generateImage(provider, options) {
  const {
    prompt,
    n = 1,
    size = '1024x1024',
    aspectRatio,
    quality,
    responseFormat = 'b64_json',
    signal,
  } = options

  const client = createApiClient(provider)
  const agnes = isAgnesProvider(provider)
  const body = {
    model: provider.imageModel,
    prompt,
    n,
  }
  const sendQuality = quality && supportsImageQuality(provider)

  if (agnes) {
    // Agnes：禁止顶层 response_format；文生图用 return_base64
    body.size = normalizeAgnesImageSize(size)
    if (responseFormat === 'b64_json') body.return_base64 = true
    else body.extra_body = { response_format: 'url' }
  } else if (provider.provider === 'xai') {
    body.response_format = responseFormat
    if (aspectRatio) body.aspect_ratio = aspectRatio
    if (sendQuality) body.quality = quality
  } else {
    body.response_format = responseFormat
    if (size) body.size = size
    if (sendQuality) body.quality = quality
  }

  const { data } = await client.post('/images/generations', body, { signal })
  return normalizeImageResponse(data)
}

export async function editImage(provider, options) {
  const {
    prompt,
    imageFile,
    n = 1,
    size = '1024x1024',
    aspectRatio,
    quality,
    responseFormat = 'b64_json',
    signal,
  } = options

  const useCorsProxy = Boolean(provider.useCorsProxy)

  const compressed = await compressImageFile(imageFile)

  // Agnes：图生图也走 /images/generations + extra_body.image
  if (isAgnesProvider(provider)) {
    const dataUrl = await fileToDataUrl(compressed)
    const client = createApiClient(provider)
    const body = {
      model: provider.imageModel,
      prompt,
      n,
      size: normalizeAgnesImageSize(size),
      extra_body: {
        image: [dataUrl],
        response_format: responseFormat === 'b64_json' ? 'b64_json' : 'url',
      },
    }
    const { data } = await client.post('/images/generations', body, { signal })
    return normalizeImageResponse(data)
  }

  if (provider.provider === 'xai') {
    const dataUrl = await fileToDataUrl(compressed)
    const client = createApiClient(provider)
    const body = {
      model: provider.imageModel,
      prompt,
      n,
      response_format: responseFormat,
      image: {
        url: dataUrl,
        type: 'image_url',
      },
    }
    if (aspectRatio) body.aspect_ratio = aspectRatio
    if (quality && supportsImageQuality(provider)) body.quality = quality
    const { data } = await client.post('/images/edits', body, { signal })
    return normalizeImageResponse(data)
  }

  // OpenAI / 兼容：multipart form
  const form = new FormData()
  form.append('model', provider.imageModel)
  form.append('prompt', prompt)
  form.append('n', String(n))
  form.append('size', size)
  form.append('response_format', responseFormat)
  form.append('image', compressed)

  const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)

  let res
  try {
    res = await appFetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers: proxyHeaders(
        provider.baseUrl,
        useCorsProxy,
        authHeaders(provider.apiKey),
      ),
      body: form,
      signal,
      connectTimeout: API_TIMEOUT_MS,
    })
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error
    throw new Error(formatNetworkError(error, useCorsProxy))
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

  const data = await res.json()
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
    signal?.addEventListener?.('abort', onAbort, { once: true })
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
    typeof progressRaw === 'number' && Number.isFinite(progressRaw)
      ? progressRaw
      : undefined
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
      headers: proxyHeaders(
        provider.baseUrl,
        useCorsProxy,
        authHeaders(provider.apiKey),
      ),
      signal,
      connectTimeout: API_TIMEOUT_MS,
    })
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error
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

async function createAgnesVideoJob(provider, options) {
  const {
    prompt,
    mode = 'txt2video',
    imageFile,
    seconds,
    duration,
    size,
    aspectRatio,
    signal,
  } = options
  const model = String(provider.videoModel || '').trim()
  if (!model) throw new Error('请先设置视频模型')
  if (!prompt?.trim() && mode !== 'img2video') {
    throw new Error('请输入提示词')
  }
  if (mode === 'img2video' && !imageFile) {
    throw new Error('图生视频需要上传参考图')
  }

  const client = createApiClient(provider)
  const body = {
    model,
    prompt: prompt || '',
    seconds: clampAgnesVideoSeconds(seconds, duration),
    size: normalizeAgnesVideoSize(size, provider),
    n: 1,
  }
  if (aspectRatio) body.aspect_ratio = aspectRatio

  if (mode === 'img2video' && imageFile) {
    // Agnes 2.5：首帧控制用 keyframe + first_frame（需可访问 URL / dataURL）
    const compressed = await compressImageFile(imageFile)
    const dataUrl = await fileToDataUrl(compressed)
    body.mode = 'keyframe'
    body.first_frame = dataUrl
  } else {
    body.mode = 'text'
  }

  const { data } = await client.post('/videos', body, { signal })
  const job = buildNormalizedVideoJob(data)
  if (!job.jobId) throw new Error('未返回 video_id')
  return job
}

async function createOpenAiVideoJob(provider, options) {
  const {
    prompt,
    mode = 'txt2video',
    imageFile,
    seconds,
    duration,
    size,
    signal,
  } = options
  const model = String(provider.videoModel || '').trim()
  if (!model) throw new Error('请先设置视频模型')
  if (!prompt?.trim() && mode !== 'img2video') {
    throw new Error('请输入提示词')
  }
  if (mode === 'img2video' && !imageFile) {
    throw new Error('图生视频需要上传参考图')
  }

  const sec = seconds ?? duration
  const useCorsProxy = Boolean(provider.useCorsProxy)

  if (mode === 'img2video' && imageFile) {
    const compressed = await compressImageFile(imageFile)
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', prompt || '')
    if (sec != null && sec !== '') form.append('seconds', String(sec))
    if (size) form.append('size', size)
    form.append('input_reference', compressed)

    const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)
    let res
    try {
      res = await appFetch(`${baseUrl}/videos`, {
        method: 'POST',
        headers: proxyHeaders(
          provider.baseUrl,
          useCorsProxy,
          authHeaders(provider.apiKey),
        ),
        body: form,
        signal,
        connectTimeout: API_TIMEOUT_MS,
      })
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error
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
    const data = await res.json()
    return buildNormalizedVideoJob(data)
  }

  const client = createApiClient(provider)
  const body = {
    model,
    prompt: prompt || '',
  }
  if (sec != null && sec !== '') body.seconds = String(sec)
  if (size) body.size = size
  const { data } = await client.post('/videos', body, { signal })
  return buildNormalizedVideoJob(data)
}

async function createXaiVideoJob(provider, options) {
  const {
    prompt,
    mode = 'txt2video',
    imageFile,
    seconds,
    duration,
    aspectRatio,
    resolution,
    signal,
  } = options
  const model = String(provider.videoModel || '').trim() || 'grok-imagine-video'
  if (!prompt?.trim() && mode !== 'img2video') {
    throw new Error('请输入提示词')
  }
  if (mode === 'img2video' && !imageFile) {
    throw new Error('图生视频需要上传参考图')
  }

  const client = createApiClient(provider)
  const body = {
    model,
    prompt: prompt || '',
  }
  const dur = duration ?? seconds
  if (dur != null && dur !== '') body.duration = Number(dur) || dur
  if (aspectRatio) body.aspect_ratio = aspectRatio
  if (resolution) body.resolution = resolution

  if (mode === 'img2video' && imageFile) {
    const compressed = await compressImageFile(imageFile)
    const dataUrl = await fileToDataUrl(compressed)
    body.image = {
      url: dataUrl,
      type: 'image_url',
    }
  }

  const { data } = await client.post('/videos/generations', body, { signal })
  const job = buildNormalizedVideoJob(data)
  if (!job.jobId) throw new Error('未返回 request_id')
  if (!job.status || job.status === 'queued') {
    job.status = 'queued'
  }
  return job
}

/**
 * 创建视频生成任务（文生 / 图生）
 * @returns {Promise<{ jobId, status, progress?, videoUrl?, errorMessage?, raw? }>}
 */
export async function createVideoJob(provider, options = {}) {
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')
  if (provider.provider === 'xai') {
    return createXaiVideoJob(provider, options)
  }
  if (isAgnesProvider(provider)) {
    return createAgnesVideoJob(provider, options)
  }
  return createOpenAiVideoJob(provider, options)
}

async function getAgnesVideoJob(provider, jobId, options = {}) {
  const id = String(jobId || '').trim()
  const { signal } = options
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const root = resolveAgnesApiHubRoot(provider.baseUrl, useCorsProxy)
  const model = String(provider.videoModel || '').trim()
  const qs = new URLSearchParams({ video_id: id })
  if (model) qs.set('model_name', model)
  const url = `${root}/agnesapi?${qs.toString()}`

  let res
  try {
    res = await appFetch(url, {
      method: 'GET',
      headers: proxyHeaders(
        provider.baseUrl,
        useCorsProxy,
        authHeaders(provider.apiKey),
      ),
      signal,
      connectTimeout: API_TIMEOUT_MS,
    })
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error
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
  const data = await res.json()
  return buildNormalizedVideoJob(data, id)
}

/**
 * 查询视频任务状态；OpenAI 兼容完成且无 url 时尝试拉取 /content
 */
export async function getVideoJob(provider, jobId, options = {}) {
  const id = String(jobId || '').trim()
  if (!id) throw new Error('缺少任务 ID')
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')

  const { signal, fetchContent = true } = options

  if (isAgnesProvider(provider)) {
    return getAgnesVideoJob(provider, id, { signal })
  }

  const client = createApiClient(provider)
  const { data } = await client.get(`/videos/${encodeURIComponent(id)}`, { signal })
  const job = buildNormalizedVideoJob(data, id)

  if (
    fetchContent &&
    job.status === 'completed' &&
    !job.videoUrl &&
    provider.provider !== 'xai'
  ) {
    try {
      job.videoUrl = await fetchOpenAiVideoContentUrl(provider, id, signal)
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      job.errorMessage = toErrorMessage(e, '下载视频内容失败')
      // 仍标记 completed，由上层决定是否当失败；保留 raw
    }
  }

  return job
}

/**
 * 轮询直至完成 / 失败
 */
export async function waitVideoJob(provider, jobId, options = {}) {
  const {
    signal,
    onProgress,
    intervalMs = 5000,
    fetchContent = true,
  } = options
  const interval = Math.max(1000, Number(intervalMs) || 5000)

  while (true) {
    if (signal?.aborted) {
      const err = new Error('已取消')
      err.name = 'AbortError'
      throw err
    }
    const job = await getVideoJob(provider, jobId, { signal, fetchContent })
    onProgress?.(job)
    if (job.status === 'completed' || job.status === 'failed') {
      return job
    }
    await sleep(interval, signal)
  }
}

/**
 * 创建并等待完成
 */
export async function generateVideo(provider, options = {}) {
  const { signal, onProgress, intervalMs, ...createOpts } = options
  const created = await createVideoJob(provider, { ...createOpts, signal })
  onProgress?.(created)
  if (created.status === 'completed' || created.status === 'failed') {
    if (
      created.status === 'completed' &&
      !created.videoUrl &&
      provider.provider !== 'xai' &&
      !isAgnesProvider(provider)
    ) {
      return waitVideoJob(provider, created.jobId, { signal, onProgress, intervalMs })
    }
    return created
  }
  if (!created.jobId) throw new Error('未返回任务 ID')
  return waitVideoJob(provider, created.jobId, { signal, onProgress, intervalMs })
}
