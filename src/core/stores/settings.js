/**
 * 应用设置 Pinia store：主题、更新偏好、对话上下文裁剪、多提供商 CRUD。
 * 持久化键：settings；apiKey 落盘前加密。
 */
import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@core/utils/storage'
import {createId} from '@core/utils/id'
import {DEFAULT_CHAT_CONTEXT_MAX_TURNS} from '@core/utils/constants'
import {decryptSecret, encryptSecret} from '@core/utils/secret'
import {notifyStorageError} from '@core/utils/toast'

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

export const useSettingsStore = defineStore('settings', {
  state: () => {
    const saved = loadJSON('settings', null)
    const theme = saved?.theme === 'light' ? 'light' : 'dark'
    if (saved?.providers?.length) {
      return {
        providers: saved.providers.map(normalizeProvider),
        activeProviderId: saved.activeProviderId || saved.providers[0].id,
        autoCheckUpdate: saved.autoCheckUpdate !== false,
        skippedUpdateVersion: saved.skippedUpdateVersion || '',
        availableUpdateVersion: '',
        chatContextTrimEnabled: saved.chatContextTrimEnabled !== false,
        chatContextMaxTurns:
          Number(saved.chatContextMaxTurns) > 0
            ? Number(saved.chatContextMaxTurns)
            : DEFAULT_CHAT_CONTEXT_MAX_TURNS,
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
      chatContextTrimEnabled: true,
      chatContextMaxTurns: DEFAULT_CHAT_CONTEXT_MAX_TURNS,
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
    setTheme(theme) {
      this.theme = theme === 'light' ? 'light' : 'dark'
      this.persist()
    },
    toggleTheme() {
      this.setTheme(this.theme === 'light' ? 'dark' : 'light')
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
