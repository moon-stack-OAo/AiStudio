import axios from 'axios'
import {appFetch} from '@/utils/http'
import {formatNetworkError, isTauri, proxyHeaders, resolveBaseUrl,} from '@/utils/request'
import {API_TIMEOUT_MS, DEFAULT_TEMPERATURE} from '@/utils/constants'

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
      const data = error.response?.data
      const msg =
        extractApiErrorMessage(data) ||
        (typeof data === 'string' ? data : '') ||
        formatNetworkError(error, useCorsProxy)
      const wrapped = new Error(msg)
      wrapped.status = error.response?.status
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
    throw new Error(message)
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

  if (provider.provider === 'xai') {
    const dataUrl = await fileToDataUrl(imageFile)
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
  form.append('image', imageFile)

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
    throw new Error(message)
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
