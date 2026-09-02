import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {isBuiltinProvider, useSettingsStore} from '@core/stores/settings'
import {testProviderConnection} from '@core/api/client'
import {useProviderModels} from '@core/composables/useProviderModels'
import {filterModelsByKind, toSelectOptions} from '@core/utils/models'
import {isTauri} from '@core/utils/request'
import {warnUnsafeUrl} from '@core/utils/urlSafety'

export const PROVIDER_TYPE_OPTIONS = [
  {label: 'OpenAI / 兼容接口', value: 'openai'},
  {label: 'OpenAI 兼容（自定义）', value: 'openai-compatible'},
  {label: 'xAI Grok', value: 'xai'},
]

export function providerTypeLabel(type) {
  return PROVIDER_TYPE_OPTIONS.find((o) => o.value === type)?.label || type || '未分类'
}

/**
 * 提供商设置页共享逻辑（桌面列表+折叠 / Android 选择器+分组共用）。
 */
export function useProvidersSettings() {
  const settings = useSettingsStore()
  const message = useMessage()
  const dialog = useDialog()

  const showViteCorsProxy = import.meta.env.DEV && !isTauri()
  const selectedId = ref(settings.activeProviderId)
  const testing = ref(false)
  let persistTimer = null

  watch(
    () => settings.activeProviderId,
    (id) => {
      selectedId.value = id
    },
  )

  const current = computed(() => settings.providers.find((p) => p.id === selectedId.value))
  const baseUrlRiskHint = computed(() => warnUnsafeUrl(current.value?.baseUrl || ''))

  const {
    loading: modelsLoading,
    models: providerModels,
    refresh: refreshModels,
  } = useProviderModels(() => current.value, {kind: 'all'})

  function modelOptionsByKind(kind, currentModel) {
    let filtered = filterModelsByKind(providerModels.value, kind)
    if (!filtered.length && providerModels.value.length) {
      filtered = providerModels.value
    }
    return toSelectOptions(filtered, {current: currentModel})
  }

  const chatModelOptions = computed(() => modelOptionsByKind('chat', current.value?.chatModel))
  const imageModelOptions = computed(() => modelOptionsByKind('image', current.value?.imageModel))
  const videoModelOptions = computed(() => modelOptionsByKind('video', current.value?.videoModel))

  async function refreshModelLists() {
    try {
      await refreshModels({force: true})
      message.success('模型列表已刷新')
    } catch (e) {
      message.error(e?.message || '刷新模型失败')
    }
  }

  const canRemoveCurrent = computed(
    () => Boolean(current.value) && !isBuiltinProvider(current.value),
  )

  function onSelect(id) {
    selectedId.value = id
    settings.setActiveProvider(id)
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      settings.persist()
    }, 400)
  }

  function flushPersist() {
    if (!persistTimer) return
    clearTimeout(persistTimer)
    persistTimer = null
    settings.persist()
  }

  function patch(field, value) {
    if (!current.value) return
    settings.updateProvider(current.value.id, {[field]: value}, {persist: false})
    schedulePersist()
  }

  function addCustom() {
    flushPersist()
    const item = settings.addProvider({
      name: '自定义接口',
      baseUrl: '',
      apiKey: '',
      chatModel: '',
      imageModel: '',
      videoModel: '',
      provider: 'openai-compatible',
    })
    selectedId.value = item.id
    message.success('已添加自定义提供商')
  }

  function removeCurrent() {
    if (!current.value) return
    if (isBuiltinProvider(current.value)) {
      message.warning('内置提供商不可删除，可「恢复预设」重置')
      return
    }
    flushPersist()
    const ok = settings.removeProvider(current.value.id)
    if (!ok) {
      message.warning('至少保留一个提供商')
      return
    }
    selectedId.value = settings.activeProviderId
    message.success('已删除自定义提供商')
  }

  function reset() {
    dialog.warning({
      title: '恢复预设',
      content: '将恢复默认提供商配置，已填写的 API Key 等会丢失，是否继续？',
      positiveText: '继续',
      negativeText: '取消',
      onPositiveClick: () => {
        flushPersist()
        settings.resetPresets()
        selectedId.value = settings.activeProviderId
        message.success('已恢复默认预设')
      },
    })
  }

  onBeforeUnmount(() => {
    flushPersist()
  })

  async function testConnection() {
    if (!current.value) return
    if (!current.value.baseUrl) {
      message.warning('请先填写 Base URL')
      return
    }
    testing.value = true
    try {
      const result = await testProviderConnection(current.value)
      message.success(result.detail || '连接成功')
      refreshModels({force: true}).catch(() => {})
    } catch (e) {
      message.error(e?.message || '连接失败')
    } finally {
      testing.value = false
    }
  }

  return {
    settings,
    showViteCorsProxy,
    selectedId,
    testing,
    current,
    baseUrlRiskHint,
    modelsLoading,
    chatModelOptions,
    imageModelOptions,
    videoModelOptions,
    canRemoveCurrent,
    providerTypeOptions: PROVIDER_TYPE_OPTIONS,
    providerTypeLabel,
    onSelect,
    patch,
    addCustom,
    removeCurrent,
    reset,
    testConnection,
    refreshModelLists,
  }
}
