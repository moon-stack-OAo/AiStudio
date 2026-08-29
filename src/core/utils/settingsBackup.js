/**
 * 设置导入/导出（提供商 + 对话相关偏好）。
 */

const CHAT_KEYS = [
  'chatContextTrimEnabled',
  'chatContextMaxTurns',
  'chatTemperature',
  'chatSystemPrompt',
  'chatContextMaxCharsEnabled',
  'chatContextMaxChars',
  'chatMaxTokens',
  'apiTimeoutMs',
]

function normalizeExportTheme(theme) {
  if (theme === 'light' || theme === 'dark' || theme === 'system') return theme
  return 'dark'
}

function pickProvider(p, {includeSecrets}) {
  const apiKey = p?.apiKey ? (includeSecrets ? String(p.apiKey) : '***') : ''
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl || '',
    apiKey,
    chatModel: p.chatModel || '',
    imageModel: p.imageModel || '',
    videoModel: p.videoModel || '',
    provider: p.provider || 'openai-compatible',
    useCorsProxy: p.useCorsProxy !== false,
    builtin: Boolean(p.builtin),
  }
}

/**
 * @param {object} state settings store state / plain object
 * @param {{ includeSecrets?: boolean }} [options]
 */
export function buildSettingsExport(state, options = {}) {
  const includeSecrets = Boolean(options.includeSecrets)
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    theme: normalizeExportTheme(state.theme),
    uiFontScale: state.uiFontScale ?? 1,
    uiDensity: state.uiDensity === 'compact' ? 'compact' : 'comfortable',
    autoCheckUpdate: state.autoCheckUpdate !== false,
    activeProviderId: state.activeProviderId || '',
    chatContextTrimEnabled: state.chatContextTrimEnabled !== false,
    chatContextMaxTurns: state.chatContextMaxTurns,
    chatTemperature: state.chatTemperature,
    chatSystemPrompt: state.chatSystemPrompt ?? '',
    chatContextMaxCharsEnabled: Boolean(state.chatContextMaxCharsEnabled),
    chatContextMaxChars: state.chatContextMaxChars,
    chatMaxTokens: state.chatMaxTokens ?? 0,
    apiTimeoutMs: state.apiTimeoutMs,
    providers: (state.providers || []).map((p) => pickProvider(p, {includeSecrets})),
  }
}

/**
 * 校验并规范化导入数据。
 * @param {unknown} data
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function parseSettingsImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {ok: false, error: '无效的设置文件'}
  }
  const providers = data.providers
  if (providers != null && !Array.isArray(providers)) {
    return {ok: false, error: 'providers 格式无效'}
  }
  if (Array.isArray(providers)) {
    for (const p of providers) {
      if (!p || typeof p !== 'object' || !p.id) {
        return {ok: false, error: '提供商条目缺少 id'}
      }
    }
  }
  return {ok: true, value: data}
}

/**
 * 判断导入数据中是否含有真实 API Key（非空且非脱敏 ***）。
 * @param {object} data
 */
export function importContainsSecrets(data) {
  return (data?.providers || []).some((p) => {
    const key = String(p?.apiKey || '').trim()
    return key && key !== '***'
  })
}

/**
 * 将导入数据应用到 settings store。
 * @param {import('pinia').Store} store
 * @param {object} data
 * @param {{ mergeProviders?: boolean }} [options]
 */
export function applySettingsImport(store, data, options = {}) {
  const mergeProviders = options.mergeProviders !== false

  if (typeof data.chatContextTrimEnabled === 'boolean') {
    store.setChatContextTrimEnabled(data.chatContextTrimEnabled)
  }
  if (data.chatContextMaxTurns != null) {
    store.setChatContextMaxTurns(data.chatContextMaxTurns)
  }
  if (data.chatTemperature != null) {
    store.setChatTemperature(data.chatTemperature)
  }
  if (typeof data.chatSystemPrompt === 'string') {
    store.setChatSystemPrompt(data.chatSystemPrompt)
  }
  if (typeof data.chatContextMaxCharsEnabled === 'boolean') {
    store.setChatContextMaxCharsEnabled(data.chatContextMaxCharsEnabled)
  }
  if (data.chatContextMaxChars != null) {
    store.setChatContextMaxChars(data.chatContextMaxChars)
  }
  if (data.chatMaxTokens != null) {
    store.setChatMaxTokens(data.chatMaxTokens)
  }
  if (data.apiTimeoutMs != null) {
    store.setApiTimeoutMs(data.apiTimeoutMs)
  }
  if (data.theme === 'light' || data.theme === 'dark' || data.theme === 'system') {
    store.setTheme(data.theme)
  }
  if (data.uiFontScale != null) {
    store.setUiFontScale(data.uiFontScale)
  }
  if (data.uiDensity === 'compact' || data.uiDensity === 'comfortable') {
    store.setUiDensity(data.uiDensity)
  }
  if (typeof data.autoCheckUpdate === 'boolean') {
    store.setAutoCheckUpdate(data.autoCheckUpdate)
  }

  const incoming = Array.isArray(data.providers) ? data.providers : []
  if (!incoming.length) {
    store.persist()
    return {providersUpdated: 0, containsSecrets: false}
  }

  let updated = 0
  const containsSecrets = importContainsSecrets(data)

  if (!mergeProviders) {
    // 覆盖：用导入列表重建（保留结构字段）
    store.providers = incoming.map((p) => {
      const apiKey = String(p.apiKey || '')
      return {
        id: p.id,
        name: p.name || '自定义',
        baseUrl: p.baseUrl || '',
        apiKey: apiKey === '***' ? '' : apiKey,
        chatModel: p.chatModel || '',
        imageModel: p.imageModel || '',
        videoModel: p.videoModel || '',
        provider: p.provider || 'openai-compatible',
        useCorsProxy: p.useCorsProxy !== false,
        builtin: Boolean(p.builtin),
      }
    })
    updated = store.providers.length
    if (data.activeProviderId && store.providers.some((p) => p.id === data.activeProviderId)) {
      store.activeProviderId = data.activeProviderId
    } else if (store.providers[0]) {
      store.activeProviderId = store.providers[0].id
    }
  } else {
    for (const p of incoming) {
      const existing = store.providers.find((x) => x.id === p.id)
      const apiKeyRaw = String(p.apiKey || '')
      const apiKey = apiKeyRaw === '***' ? undefined : apiKeyRaw
      if (existing) {
        const patch = {
          name: p.name ?? existing.name,
          baseUrl: p.baseUrl ?? existing.baseUrl,
          chatModel: p.chatModel ?? existing.chatModel,
          imageModel: p.imageModel ?? existing.imageModel,
          videoModel: p.videoModel ?? existing.videoModel,
          provider: p.provider ?? existing.provider,
          useCorsProxy:
            p.useCorsProxy !== undefined ? p.useCorsProxy !== false : existing.useCorsProxy,
        }
        if (apiKey !== undefined) patch.apiKey = apiKey
        store.updateProvider(existing.id, patch, {persist: false})
        updated += 1
      } else {
        store.providers.push({
          id: p.id,
          name: p.name || '自定义',
          baseUrl: p.baseUrl || '',
          apiKey: apiKey || '',
          chatModel: p.chatModel || '',
          imageModel: p.imageModel || '',
          videoModel: p.videoModel || '',
          provider: p.provider || 'openai-compatible',
          useCorsProxy: p.useCorsProxy !== false,
          builtin: Boolean(p.builtin),
        })
        updated += 1
      }
    }
    if (data.activeProviderId && store.providers.some((p) => p.id === data.activeProviderId)) {
      store.activeProviderId = data.activeProviderId
    }
  }

  store.persist()
  return {providersUpdated: updated, containsSecrets, chatKeys: CHAT_KEYS}
}
