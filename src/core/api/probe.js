import {createApiClient} from './http.js'
import {toErrorMessage} from './errors.js'

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
