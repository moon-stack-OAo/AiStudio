import axios from 'axios'
import {formatNetworkError, proxyHeaders, resolveBaseUrl,} from '@/utils/request'

export function createApiClient(provider) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const client = axios.create({
    baseURL: resolveBaseUrl(provider.baseUrl, useCorsProxy),
    timeout: 180000,
    headers: proxyHeaders(provider.baseUrl, useCorsProxy, {
      Authorization: `Bearer ${provider.apiKey || ''}`,
      'Content-Type': 'application/json',
    }),
  })

  client.interceptors.response.use(
    (res) => res,
    (error) => {
      const data = error.response?.data
      const msg =
        data?.error?.message ||
        data?.message ||
        formatNetworkError(error, useCorsProxy)
      return Promise.reject(new Error(msg))
    },
  )

  return client
}

export async function chatCompletions(provider, { messages, stream = false, signal }) {
  const client = createApiClient(provider)
  const { data } = await client.post(
    '/chat/completions',
    {
      model: provider.chatModel,
      messages,
      stream,
      temperature: 0.7,
    },
    { signal },
  )
  return data
}

export async function streamChatCompletions(provider, { messages, onDelta, signal }) {
  const useCorsProxy = Boolean(provider.useCorsProxy)
  const baseUrl = resolveBaseUrl(provider.baseUrl, useCorsProxy)

  let res
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: proxyHeaders(provider.baseUrl, useCorsProxy, {
        Authorization: `Bearer ${provider.apiKey || ''}`,
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        model: provider.chatModel,
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal,
    })
  } catch (error) {
    throw new Error(formatNetworkError(error, useCorsProxy))
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = await res.json()
      message = err?.error?.message || err?.message || message
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta?.content || ''
        if (delta) {
          fullText += delta
          onDelta?.(delta, fullText)
        }
      } catch {
        // ignore malformed chunk
      }
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

  const { data } = await client.post('/images/generations', body)
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
    const { data } = await client.post('/images/edits', body)
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
    res = await fetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers: proxyHeaders(provider.baseUrl, useCorsProxy, {
        Authorization: `Bearer ${provider.apiKey || ''}`,
      }),
      body: form,
    })
  } catch (error) {
    throw new Error(formatNetworkError(error, useCorsProxy))
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const err = await res.json()
      message = err?.error?.message || err?.message || message
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
