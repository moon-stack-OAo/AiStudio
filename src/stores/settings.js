import {defineStore} from 'pinia'
import {loadJSON, saveJSON} from '@/utils/storage'
import {createId} from '@/utils/id'

const PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModel: 'gpt-4o',
    imageModel: 'gpt-image-1',
    provider: 'openai',
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    chatModel: 'grok-4',
    imageModel: 'grok-imagine-image',
    provider: 'xai',
  },
]

function createProvider(partial = {}) {
  return {
    id: createId('provider'),
    name: '自定义',
    baseUrl: '',
    apiKey: '',
    chatModel: 'gpt-4o',
    imageModel: 'dall-e-3',
    provider: 'openai-compatible',
    // 浏览器开发时经 Vite 代理转发，绕过中转站 CORS
    useCorsProxy: true,
    ...partial,
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => {
    const saved = loadJSON('settings', null)
    if (saved?.providers?.length) {
      return {
        providers: saved.providers.map((p) => {
          const next = {
            useCorsProxy: true,
            ...p,
          }
          // 兼容旧预设模型名
          if (next.imageModel === 'grok-imagine-image-2.0') {
            next.imageModel = 'grok-imagine-image'
          }
          return next
        }),
        activeProviderId: saved.activeProviderId || saved.providers[0].id,
        theme: saved.theme || 'dark',
      }
    }
    const providers = PRESETS.map((p) => createProvider(p))
    return {
      providers,
      activeProviderId: providers[0].id,
      theme: 'dark',
    }
  },
  getters: {
    activeProvider(state) {
      return (
        state.providers.find((p) => p.id === state.activeProviderId) ||
        state.providers[0] ||
        null
      )
    },
    providerOptions(state) {
      return state.providers.map((p) => ({
        label: p.name,
        value: p.id,
      }))
    },
  },
  actions: {
    persist() {
      saveJSON('settings', {
        providers: this.providers,
        activeProviderId: this.activeProviderId,
        theme: this.theme,
      })
    },
    setActiveProvider(id) {
      this.activeProviderId = id
      this.persist()
    },
    updateProvider(id, patch) {
      const target = this.providers.find((p) => p.id === id)
      if (!target) return
      Object.assign(target, patch)
      this.persist()
    },
    addProvider(partial = {}) {
      const item = createProvider(partial)
      this.providers.push(item)
      this.activeProviderId = item.id
      this.persist()
      return item
    },
    removeProvider(id) {
      if (this.providers.length <= 1) return false
      this.providers = this.providers.filter((p) => p.id !== id)
      if (this.activeProviderId === id) {
        this.activeProviderId = this.providers[0].id
      }
      this.persist()
      return true
    },
    resetPresets() {
      this.providers = PRESETS.map((p) => createProvider(p))
      this.activeProviderId = this.providers[0].id
      this.persist()
    },
  },
})
