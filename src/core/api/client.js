import axios from 'axios'
import {appFetch} from '@core/utils/http'
import {compressImageFile} from '@core/utils/imageCompress'
import {formatNetworkError, isTauri, proxyHeaders, resolveBaseUrl,} from '@core/utils/request'
import {API_TIMEOUT_MS, DEFAULT_TEMPERATURE} from '@core/utils/constants'

const HTTP_413_HINT =
  '上传内容过大（HTTP 413）。请换更小的参考图，或已自动压缩仍失败则换图重试。'

function extractApiErrorMessage(data) {
  if (data == null) return ''
  if (typeof data === 'string') return data.trim()
  if (typeof data !== 'object') return String(data)
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
    return JSON.stringify(data)
  } catch {
    return ''
  }
}

/** 将 HTTP 状态与响应体整理为可读错误文案 */
function httpStatusErrorMessage(status, bodyMessage = '') {
  if (status === 413) return HTTP_413_HINT
  const fromBody = String(bodyMessage || '').trim()
  if (fromBody && !/^HTTP\s*413\b/i.test(fromBody) && !/payload too large|request entity too large/i.test(fromBody)) {
    return fromBody
  }
  if (status === 413 || /payload too large|request entity too large/i.test(fromBody)) {
    return HTTP_413_HINT
  }
  return fromBody || (status ? `HTTP ${status}` : '')
}

/** 将任意抛出值转为可读错误文案 */
export function toErrorMessage(error, fallback = '未知错误') {
  if (error == null) return fallback
  if (typeof error === 'string') return error || fallback
  if (error instanceof Error) {
    const msg = String(error.message || '').trim()
    return msg && msg !== 'undefined' ? msg : fallback
  }
  if (typeof error === 'object') {
    const fromFields =
      extractApiErrorMessage(error) ||
      (typeof error.message === 'string' ? error.message : '') ||
      (typeof error.error === 'string' ? error.error : '')
    if (fromFields && fromFields !== 'undefined') return fromFields
  }
  const raw = String(error)
  return raw && raw !== 'undefined' && raw !== '[object Object]' ? raw : fallback
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
      const raw =
        extractApiErrorMessage(data) ||
        (typeof data === 'string' ? data : '') ||
        formatNetworkError(error, useCorsProxy)
      const msg = httpStatusErrorMessage(status, raw) || raw
      const wrapped = new Error(msg)
      wrapped.status = status
      wrapped.response = error.response
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
  const body = {
    model: provider.imageModel,
    prompt,
    n,
    response_format: responseFormat,
  }

  if (provider.provider === 'xai') {
    if (aspectRatio) body.aspect_ratio = aspectRatio
    if (quality) body.quality = quality
  } else {
    if (size) body.size = size
    if (quality) body.quality = quality
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
    if (quality) body.quality = quality
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
    data.video?.url ||
    data.output?.url ||
    data.result?.url ||
    ''
  )
}

function extractVideoJobId(data) {
  if (!data || typeof data !== 'object') return ''
  return String(
    data.id ||
      data.job_id ||
      data.jobId ||
      data.request_id ||
      data.requestId ||
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
  return createOpenAiVideoJob(provider, options)
}

/**
 * 查询视频任务状态；OpenAI 兼容完成且无 url 时尝试拉取 /content
 */
export async function getVideoJob(provider, jobId, options = {}) {
  const id = String(jobId || '').trim()
  if (!id) throw new Error('缺少任务 ID')
  if (!provider?.baseUrl) throw new Error('请先填写 Base URL')

  const { signal, fetchContent = true } = options
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
      provider.provider !== 'xai'
    ) {
      return waitVideoJob(provider, created.jobId, { signal, onProgress, intervalMs })
    }
    return created
  }
  if (!created.jobId) throw new Error('未返回任务 ID')
  return waitVideoJob(provider, created.jobId, { signal, onProgress, intervalMs })
}
