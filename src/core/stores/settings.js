/**
 * 应用设置 Pinia store：主题、更新偏好、对话上下文裁剪、多提供商 CRUD。
 * 持久化键：settings；apiKey 落盘前加密。
 */
import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {
  API_TIMEOUT_MS,
  API_TIMEOUT_MS_MAX,
  API_TIMEOUT_MS_MIN,
  DEFAULT_CHAT_CONTEXT_MAX_CHARS,
  DEFAULT_CHAT_CONTEXT_MAX_TURNS,
  DEFAULT_CHAT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  UI_FONT_SCALE_OPTIONS,
} from '@core/utils/constants'
import {decryptSecret, encryptSecret} from '@core/utils/secret'
import {notifyStorageError} from '@core/utils/toast'
import {getSystemTheme} from '@core/utils/theme'

const PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o',
    imageModel: 'gpt-image-1',
    videoModel: 'sora-2',
    provider: 'openai',
    builtin: true,
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    chatModel: 'grok-4.5',
    imageModel: 'grok-imagine-image',
    videoModel: 'grok-imagine-video',
    provider: 'xai',
    builtin: true,
  },
]

/** 内置预设不可删除 */
export function isBuiltinProvider(provider) {
  return Boolean(provider?.builtin)
}

function createProvider(partial = {}) {
  return {
    id: createId('provider'),
    name: '自定义',
    baseUrl: '',
    apiKey: '',
    chatModel: '',
    imageModel: '',
    videoModel: '',
    provider: 'openai-compatible',
    useCorsProxy: true,
    builtin: false,
    ...partial,
  }
}

function normalizeProvider(p) {
  const raw = {
    useCorsProxy: true,
    builtin: false,
    videoModel: '',
    ...p,
  }
  // 落盘为密文时还原；历史明文原样保留
  raw.apiKey = decryptSecret(raw.apiKey)
  if (raw.videoModel == null) raw.videoModel = ''
  return raw
}

function serializeProviders(providers) {
  return providers.map((p) => ({
    ...p,
    apiKey: encryptSecret(p.apiKey),
  }))
}

function clampTemperature(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_TEMPERATURE
  return Math.min(2, Math.max(0, Math.round(n * 10) / 10))
}

function normalizeMaxChars(value) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CHAT_CONTEXT_MAX_CHARS
  return n
}

function normalizeTheme(value) {
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'dark'
}

function normalizeFontScale(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 1
  const nearest = UI_FONT_SCALE_OPTIONS.reduce((best, cur) =>
    Math.abs(cur - n) < Math.abs(best - n) ? cur : best,
  )
  return nearest
}

function normalizeDensity(value) {
  return value === 'compact' ? 'compact' : 'comfortable'
}

function normalizeMaxTokens(value) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CHAT_MAX_TOKENS
  return n
}

function normalizeApiTimeoutMs(value) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return API_TIMEOUT_MS
  return Math.min(API_TIMEOUT_MS_MAX, Math.max(API_TIMEOUT_MS_MIN, n))
}

function buildChatDefaults(saved = {}) {
  return {
    chatContextTrimEnabled: saved.chatContextTrimEnabled !== false,
    chatContextMaxTurns:
      Number(saved.chatContextMaxTurns) > 0
        ? Number(saved.chatContextMaxTurns)
        : DEFAULT_CHAT_CONTEXT_MAX_TURNS,
    chatTemperature:
      saved.chatTemperature != null ? clampTemperature(saved.chatTemperature) : DEFAULT_TEMPERATURE,
    chatSystemPrompt: typeof saved.chatSystemPrompt === 'string' ? saved.chatSystemPrompt : '',
    chatContextMaxCharsEnabled: Boolean(saved.chatContextMaxCharsEnabled),
    chatContextMaxChars:
      saved.chatContextMaxChars != null
        ? normalizeMaxChars(saved.chatContextMaxChars)
        : DEFAULT_CHAT_CONTEXT_MAX_CHARS,
    chatMaxTokens:
      saved.chatMaxTokens != null
        ? normalizeMaxTokens(saved.chatMaxTokens)
        : DEFAULT_CHAT_MAX_TOKENS,
    apiTimeoutMs:
      saved.apiTimeoutMs != null ? normalizeApiTimeoutMs(saved.apiTimeoutMs) : API_TIMEOUT_MS,
  }
}

function buildUiDefaults(saved = {}) {
  return {
    uiFontScale: normalizeFontScale(saved.uiFontScale ?? 1),
    uiDensity: normalizeDensity(saved.uiDensity),
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => {
    const saved = loadJSON('settings', null)
    const theme = normalizeTheme(saved?.theme)
    const chat = buildChatDefaults(saved || {})
    const ui = buildUiDefaults(saved || {})
    if (saved?.providers?.length) {
      return {
        providers: saved.providers.map(normalizeProvider),
        activeProviderId: saved.activeProviderId || saved.providers[0].id,
        autoCheckUpdate: saved.autoCheckUpdate !== false,
        skippedUpdateVersion: saved.skippedUpdateVersion || '',
        availableUpdateVersion: '',
        /** 不持久化：缓存系统偏好，供 system 主题响应式更新 */
        _systemTheme: getSystemTheme(),
        ...chat,
        ...ui,
        theme,
      }
    }
    const providers = PRESETS.map((p) => createProvider(p))
    return {
      providers,
      activeProviderId: providers[0].id,
      autoCheckUpdate: true,
      skippedUpdateVersion: '',
      availableUpdateVersion: '',
      _systemTheme: getSystemTheme(),
      ...chat,
      ...ui,
      theme,
    }
  },
  getters: {
    activeProvider(state) {
      return (
        state.providers.find((p) => p.id === state.activeProviderId) || state.providers[0] || null
      )
    },
    providerOptions(state) {
      return state.providers.map((p) => ({
        label: p.name,
        value: p.id,
      }))
    },
    hasAvailableUpdate(state) {
      return Boolean(
        state.availableUpdateVersion && state.availableUpdateVersion !== state.skippedUpdateVersion,
      )
    },
    /** 解析后的 light/dark（system 时跟随 OS） */
    resolvedTheme(state) {
      if (state.theme === 'system') {
        return state._systemTheme === 'light' ? 'light' : 'dark'
      }
      return state.theme === 'light' ? 'light' : 'dark'
    },
  },
  actions: {
    persist() {
      const ok = saveJSON('settings', {
        providers: serializeProviders(this.providers),
        activeProviderId: this.activeProviderId,
        autoCheckUpdate: this.autoCheckUpdate,
        skippedUpdateVersion: this.skippedUpdateVersion,
        chatContextTrimEnabled: this.chatContextTrimEnabled,
        chatContextMaxTurns: this.chatContextMaxTurns,
        chatTemperature: this.chatTemperature,
        chatSystemPrompt: this.chatSystemPrompt,
        chatContextMaxCharsEnabled: this.chatContextMaxCharsEnabled,
        chatContextMaxChars: this.chatContextMaxChars,
        chatMaxTokens: this.chatMaxTokens,
        apiTimeoutMs: this.apiTimeoutMs,
        uiFontScale: this.uiFontScale,
        uiDensity: this.uiDensity,
        theme: this.theme,
      })
      if (!ok) notifyStorageError('设置写入本地失败，刷新后可能丢失')
      return ok
    },
    setAvailableUpdate(version) {
      this.availableUpdateVersion = String(version || '')
    },
    clearAvailableUpdate() {
      this.availableUpdateVersion = ''
    },
    /** 同步系统浅/深色缓存（不落盘） */
    syncSystemTheme(theme) {
      const next = theme === 'light' || theme === 'dark' ? theme : getSystemTheme()
      this._systemTheme = next
    },
    setTheme(theme) {
      this.theme = normalizeTheme(theme)
      if (this.theme === 'system') this.syncSystemTheme()
      this.persist()
    },
    /**
     * 快捷切换：仅 light↔dark；若当前为 system，则落到与 resolved 相反的手动主题。
     */
    toggleTheme() {
      if (this.theme === 'system') {
        this.setTheme(this.resolvedTheme === 'light' ? 'dark' : 'light')
        return
      }
      this.setTheme(this.theme === 'light' ? 'dark' : 'light')
    },
    setUiFontScale(value) {
      this.uiFontScale = normalizeFontScale(value)
      this.persist()
    },
    setUiDensity(value) {
      this.uiDensity = normalizeDensity(value)
      this.persist()
    },

    setAutoCheckUpdate(value) {
      this.autoCheckUpdate = Boolean(value)
      this.persist()
    },
    setChatContextTrimEnabled(value) {
      this.chatContextTrimEnabled = Boolean(value)
      this.persist()
    },
    setChatContextMaxTurns(value) {
      const n = Math.max(1, Math.floor(Number(value) || DEFAULT_CHAT_CONTEXT_MAX_TURNS))
      this.chatContextMaxTurns = n
      this.persist()
    },
    setChatTemperature(value) {
      this.chatTemperature = clampTemperature(value)
      this.persist()
    },
    setChatSystemPrompt(value) {
      this.chatSystemPrompt = value == null ? '' : String(value)
      this.persist()
    },
    setChatContextMaxCharsEnabled(value) {
      this.chatContextMaxCharsEnabled = Boolean(value)
      this.persist()
    },
    setChatContextMaxChars(value) {
      this.chatContextMaxChars = normalizeMaxChars(value)
      this.persist()
    },
    setChatMaxTokens(value) {
      this.chatMaxTokens = normalizeMaxTokens(value)
      this.persist()
    },
    setApiTimeoutMs(value) {
      this.apiTimeoutMs = normalizeApiTimeoutMs(value)
      this.persist()
    },
    /** 仅清空各提供商 API Key 并持久化 */
    clearAllApiKeys() {
      for (const p of this.providers) {
        p.apiKey = ''
      }
      this.persist()
    },
    skipUpdateVersion(version) {
      this.skippedUpdateVersion = String(version || '')
      this.persist()
    },
    clearSkippedUpdateVersion() {
      this.skippedUpdateVersion = ''
      this.persist()
    },
    /** @param {string} id */
    setActiveProvider(id) {
      this.activeProviderId = id
      this.persist()
    },
    /**
     * 合并更新提供商字段（apiKey、模型、Base URL 等）
     * @param {string} id
     * @param {object} patch
     * @param {{ persist?: boolean }} [options]
     */
    updateProvider(id, patch, options = {}) {
      const {persist = true} = options
      const target = this.providers.find((p) => p.id === id)
      if (!target) return
      Object.assign(target, patch)
      if (persist) this.persist()
    },
    /**
     * 新增自定义提供商并设为当前
     * @param {object} [partial]
     * @returns {object} 新建的 provider
     */
    addProvider(partial = {}) {
      const item = createProvider(partial)
      this.providers.push(item)
      this.activeProviderId = item.id
      this.persist()
      return item
    },
    /**
     * 删除非内置提供商（至少保留一个）
     * @param {string} id
     * @returns {boolean} 是否删除成功
     */
    removeProvider(id) {
      const target = this.providers.find((p) => p.id === id)
      if (!target) return false
      if (isBuiltinProvider(target)) return false
      if (this.providers.length <= 1) return false
      this.providers = this.providers.filter((p) => p.id !== id)
      if (this.activeProviderId === id) {
        this.activeProviderId = this.providers[0].id
      }
      this.persist()
      return true
    },
    /** 重置为内置 OpenAI / xAI 预设（清空自定义） */
    resetPresets() {
      this.providers = PRESETS.map((p) => createProvider(p))
      this.activeProviderId = this.providers[0].id
      this.persist()
    },
  },
})
