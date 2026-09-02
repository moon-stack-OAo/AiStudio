import {appFetch} from '@core/utils/http'
import {formatNetworkError, proxyHeaders, resolveBaseUrl} from '@core/utils/request'
import {API_TIMEOUT_MS, DEFAULT_TEMPERATURE} from '@core/utils/constants'
import {
  extractApiErrorMessage,
  httpStatusErrorMessage,
  isAbortLike,
  sanitizeErrorText,
  toAbortError,
  toErrorMessage,
} from './errors.js'
import {authHeaders, createApiClient} from './http.js'

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
    throw new Error(
      sanitizeErrorText(formatNetworkError(error, useCorsProxy) || toErrorMessage(error), '') ||
        '请求失败，请稍后重试',
    )
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
    throw new Error(
      sanitizeErrorText(httpStatusErrorMessage(res.status, message) || message, '') ||
        `HTTP ${res.status}`,
    )
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
        throw new Error(sanitizeErrorText(streamErr, '') || '流式响应错误')
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
