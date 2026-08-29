<script setup>
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {FlashOutline, RefreshOutline, TrashOutline} from '@vicons/ionicons5'
import {isBuiltinProvider, useSettingsStore} from '@core/stores/settings'
import {testProviderConnection} from '@core/api/client'
import {useProviderModels} from '@core/composables/useProviderModels'
import {filterModelsByKind, toSelectOptions} from '@core/utils/models'
import {isTauri} from '@core/utils/request'
import {renderSelectLabel} from '@core/utils/selectRender'

const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()

const showViteCorsProxy = import.meta.env.DEV && !isTauri()

const selectedId = ref(settings.activeProviderId)
const testing = ref(false)
const tipsOpen = ref(false)
let persistTimer = null

watch(
  () => settings.activeProviderId,
  (id) => {
    selectedId.value = id
  },
)

const current = computed(() => settings.providers.find((p) => p.id === selectedId.value))

const providerOptions = computed(() =>
  settings.providers.map((p) => ({
    label: p.id === settings.activeProviderId ? `${p.name}（当前）` : p.name,
    value: p.id,
  })),
)

const {
  loading: modelsLoading,
  models: providerModels,
  refresh: refreshModels,
} = useProviderModels(() => current.value, {kind: 'all'})

function modelOptionsByKind(kind, currentModel) {
  let filtered = filterModelsByKind(providerModels.value, kind)
  // 中转站命名不规范时筛选可能为空，回退全量便于手动挑
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

const canRemoveCurrent = computed(() => Boolean(current.value) && !isBuiltinProvider(current.value))

const providerTypeOptions = [
  {label: 'OpenAI / 兼容接口', value: 'openai'},
  {label: 'OpenAI Compatible', value: 'openai-compatible'},
  {label: 'xAI Grok', value: 'xai'},
]

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

defineExpose({addCustom, reset})
</script>

<template>
  <div class="providers-page">
    <div class="picker-card">
      <div class="picker-label">当前提供商</div>
      <n-select
        :options="providerOptions"
        :render-label="renderSelectLabel"
        :value="selectedId"
        @update:value="onSelect"
      />
      <div v-if="current" class="picker-meta">
        <span class="type-tag">{{
          providerTypeOptions.find((o) => o.value === current.provider)?.label || current.provider
        }}</span>
        <span class="url">{{ current.baseUrl || '未填写 Base URL' }}</span>
      </div>
    </div>

    <div v-if="current" class="form-card">
      <div class="group">
        <div class="group-title">基本信息</div>
        <div class="field">
          <div class="field-label">名称</div>
          <n-input
            :value="current.name"
            placeholder="例如 OpenAI / Grok / 中转站"
            @update:value="(v) => patch('name', v)"
          />
        </div>
        <div class="field">
          <div class="field-label">接口类型</div>
          <n-select
            :options="providerTypeOptions"
            :render-label="renderSelectLabel"
            :value="current.provider"
            @update:value="(v) => patch('provider', v)"
          />
        </div>
      </div>

      <div class="group">
        <div class="group-title">连接</div>
        <div class="field">
          <div class="field-label">Base URL</div>
          <n-input
            :value="current.baseUrl"
            placeholder="https://api.openai.com/v1"
            @update:value="(v) => patch('baseUrl', v)"
          />
        </div>
        <div class="field">
          <div class="field-label">API Key</div>
          <n-input
            :value="current.apiKey"
            placeholder="sk-..."
            show-password-on="click"
            type="password"
            @update:value="(v) => patch('apiKey', v)"
          />
        </div>
        <div v-if="showViteCorsProxy" class="field">
          <div class="field-label">开发代理（绕过 CORS）</div>
          <div class="inline-row">
            <n-switch
              :value="Boolean(current.useCorsProxy)"
              @update:value="(v) => patch('useCorsProxy', v)"
            />
            <span class="hint">浏览器开发时访问中转站请开启</span>
          </div>
        </div>
        <n-button :loading="testing" block class="action-btn" @click="testConnection">
          <template #icon>
            <n-icon :component="FlashOutline" />
          </template>
          测试连接
        </n-button>
      </div>

      <div class="group">
        <div class="group-title">
          <span>模型</span>
          <n-button :loading="modelsLoading" quaternary size="small" @click="refreshModelLists">
            <template #icon>
              <n-icon :component="RefreshOutline" />
            </template>
            刷新
          </n-button>
        </div>
        <div class="field">
          <div class="field-label">对话模型</div>
          <n-select
            :loading="modelsLoading"
            :options="chatModelOptions"
            :render-label="renderSelectLabel"
            :value="current.chatModel || null"
            filterable
            placeholder="gpt-4o / grok-4.5"
            tag
            @update:value="(v) => patch('chatModel', v || '')"
          />
        </div>
        <div class="field">
          <div class="field-label">生图模型</div>
          <n-select
            :loading="modelsLoading"
            :options="imageModelOptions"
            :render-label="renderSelectLabel"
            :value="current.imageModel || null"
            filterable
            placeholder="gpt-image-1 / grok-imagine-image"
            tag
            @update:value="(v) => patch('imageModel', v || '')"
          />
        </div>
        <div class="field">
          <div class="field-label">视频模型</div>
          <n-select
            :loading="modelsLoading"
            :options="videoModelOptions"
            :render-label="renderSelectLabel"
            :value="current.videoModel || null"
            filterable
            placeholder="sora-2 / grok-imagine-video"
            tag
            @update:value="(v) => patch('videoModel', v || '')"
          />
        </div>
      </div>

      <div v-if="showViteCorsProxy" class="tip-bar tip-warn">
        出现 net::ERR_FAILED 多为浏览器 CORS，请开启上方「开发代理」。
      </div>

      <button class="tips-toggle" type="button" @click="tipsOpen = !tipsOpen">
        {{ tipsOpen ? '收起使用说明' : '查看使用说明' }}
      </button>
      <div v-if="tipsOpen" class="tip-bar tip-muted">
        <ul class="tips">
          <li>对话：POST {BaseURL}/chat/completions</li>
          <li>文生图：POST {BaseURL}/images/generations</li>
          <li>图生图：OpenAI multipart / xAI JSON /images/edits</li>
          <li>视频：OpenAI 兼容 /videos；xAI /videos/generations</li>
          <li>兼容中转站：填 Base URL + Key 即可</li>
        </ul>
      </div>

      <div v-if="canRemoveCurrent" class="danger">
        <n-button block quaternary type="error" @click="removeCurrent">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
          删除自定义提供商
        </n-button>
      </div>
      <div v-else class="builtin-hint">内置提供商不可删除，可用右上角恢复预设。</div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./ProvidersSettings.scss"></style>
