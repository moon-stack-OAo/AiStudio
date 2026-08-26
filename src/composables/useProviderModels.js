import {computed, ref, watch} from 'vue'
import {listProviderModels} from '@/api/client'
import {filterModelsByKind, toSelectOptions} from '@/utils/models'

/** providerId -> { models, fetchedAt, error } */
const cache = new Map()

function cacheKey(provider) {
  if (!provider?.id) return ''
  // apiKey 只记有无，避免设置页逐字输入时反复请求
  return `${provider.id}::${provider.baseUrl || ''}::${provider.apiKey ? '1' : '0'}`
}

/**
 * 拉取并缓存当前提供商模型列表，供对话/生图/设置页选择
 * @param {() => object|null} getProvider
 * @param {{ kind?: 'chat'|'image'|'all' }} options
 */
export function useProviderModels(getProvider, options = {}) {
  const kind = options.kind || 'all'
  const loading = ref(false)
  const error = ref('')
  const models = ref([])
  let requestSeq = 0

  const provider = computed(() => getProvider?.() || null)

  const optionsList = computed(() => {
    let filtered = filterModelsByKind(models.value, kind)
    // 中转站命名不规范时，生图筛选可能为空，回退到全量列表便于手动挑
    if (kind !== 'all' && !filtered.length && models.value.length) {
      filtered = models.value
    }
    return toSelectOptions(filtered, {
      current:
        kind === 'image'
          ? provider.value?.imageModel
          : kind === 'chat'
            ? provider.value?.chatModel
            : provider.value?.chatModel || provider.value?.imageModel,
    })
  })

  async function refresh({ force = false } = {}) {
    const p = provider.value
    const key = cacheKey(p)
    if (!p?.baseUrl || !p?.apiKey) {
      models.value = []
      error.value = ''
      return []
    }

    if (!force && cache.has(key)) {
      const hit = cache.get(key)
      models.value = hit.models
      error.value = hit.error || ''
      return hit.models
    }

    const seq = ++requestSeq
    loading.value = true
    error.value = ''
    try {
      const list = await listProviderModels(p)
      if (seq !== requestSeq) return models.value
      models.value = list
      cache.set(key, { models: list, fetchedAt: Date.now(), error: '' })
      return list
    } catch (e) {
      if (seq !== requestSeq) return models.value
      const msg = e?.message || '拉取模型失败'
      error.value = msg
      models.value = []
      cache.set(key, { models: [], fetchedAt: Date.now(), error: msg })
      throw e
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  watch(
    () => cacheKey(provider.value),
    () => {
      refresh().catch(() => {})
    },
    { immediate: true },
  )

  return {
    loading,
    error,
    models,
    options: optionsList,
    refresh,
  }
}
