<script setup>
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {FlashOutline, HelpCircleOutline, RefreshOutline, TrashOutline} from '@vicons/ionicons5'
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
// 默认展开：基本信息 / 连接 / 模型
const expandedNames = ref(['basic', 'connection', 'models'])
const tipsShow = ref(false)
let persistTimer = null

watch(
  () => settings.activeProviderId,
  (id) => {
    selectedId.value = id
    tipsShow.value = false
  },
)

const current = computed(() => settings.providers.find((p) => p.id === selectedId.value))

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
  {label: 'OpenAI 兼容（自定义）', value: 'openai-compatible'},
  {label: 'xAI Grok', value: 'xai'},
]

function providerTypeLabel(type) {
  return providerTypeOptions.find((o) => o.value === type)?.label || type || '未分类'
}

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
  <div class="tab-pane">
    <div class="section body">
      <aside class="list-panel">
        <div class="list-label">提供商</div>
        <div class="list">
          <button
            v-for="p in settings.providers"
            :key="p.id"
            :class="{active: p.id === selectedId}"
            class="item"
            type="button"
            @click="onSelect(p.id)"
          >
            <div class="item-top">
              <span class="name">{{ p.name }}</span>
              <span v-if="p.id === settings.activeProviderId" class="badge">当前</span>
            </div>
            <div class="item-tags">
              <span class="type-tag">{{ providerTypeLabel(p.provider) }}</span>
            </div>
            <div class="url">{{ p.baseUrl || '未填写 Base URL' }}</div>
          </button>
        </div>
      </aside>

      <div v-if="current" class="form-panel">
        <div class="section-card form-card">
          <div class="section-head">
            <div>
              <div class="section-title">{{ current.name || '提供商配置' }}</div>
              <div class="section-desc">接口凭证与模型名称</div>
            </div>
            <n-popover
              v-model:show="tipsShow"
              :width="360"
              content-class="provider-tips-popover"
              placement="bottom-end"
              trigger="click"
            >
              <template #trigger>
                <n-button aria-label="使用说明" quaternary size="small" title="使用说明">
                  <template #icon>
                    <n-icon :component="HelpCircleOutline" />
                  </template>
                  使用说明
                </n-button>
              </template>
              <ul class="tips">
                <li>对话：POST {BaseURL}/chat/completions（支持流式）</li>
                <li>文生图：POST {BaseURL}/images/generations</li>
                <li>图生图：OpenAI 用 multipart /images/edits；xAI 用 JSON /images/edits</li>
                <li>视频：OpenAI 兼容 POST /videos 并轮询；xAI POST /videos/generations</li>
                <li>任意 OpenAI 兼容中转站，填对应 Base URL + Key 即可</li>
              </ul>
            </n-popover>
          </div>

          <n-collapse
            v-model:expanded-names="expandedNames"
            arrow-placement="right"
            class="form-collapse"
            display-directive="show"
          >
            <n-collapse-item name="basic" title="基本信息">
              <div class="field-grid">
                <div class="field">
                  <div class="field-label">名称</div>
                  <n-input
                    :value="current.name"
                    placeholder="例如 OpenAI / Grok / 中转站"
                    size="small"
                    @update:value="(v) => patch('name', v)"
                  />
                </div>
                <div class="field">
                  <div class="field-label">接口类型</div>
                  <n-select
                    :options="providerTypeOptions"
                    :render-label="renderSelectLabel"
                    :value="current.provider"
                    size="small"
                    @update:value="(v) => patch('provider', v)"
                  />
                  <div class="hint">部分中转会按 URL / 模型名自动识别，不必强选专用类型</div>
                </div>
              </div>
            </n-collapse-item>

            <n-collapse-item name="connection" title="连接">
              <div class="field-grid">
                <div class="field field-full">
                  <div class="field-label">Base URL</div>
                  <n-input
                    :value="current.baseUrl"
                    placeholder="https://api.openai.com/v1"
                    size="small"
                    @update:value="(v) => patch('baseUrl', v)"
                  />
                </div>
                <div class="field field-full">
                  <div class="field-label">API Key</div>
                  <n-input
                    :value="current.apiKey"
                    placeholder="sk-..."
                    show-password-on="click"
                    size="small"
                    type="password"
                    @update:value="(v) => patch('apiKey', v)"
                  />
                </div>
                <div v-if="showViteCorsProxy" class="field field-full">
                  <div class="field-label">开发代理（绕过 CORS）</div>
                  <div class="inline-row">
                    <n-switch
                      :value="Boolean(current.useCorsProxy)"
                      size="small"
                      @update:value="(v) => patch('useCorsProxy', v)"
                    />
                    <span class="hint">浏览器 npm run dev 访问中转站时请开启</span>
                  </div>
                </div>
                <div class="field field-full">
                  <div class="field-label">连通性</div>
                  <div class="inline-row">
                    <n-button :loading="testing" size="small" @click="testConnection">
                      <template #icon>
                        <n-icon :component="FlashOutline" />
                      </template>
                      测试连接
                    </n-button>
                    <span class="hint">优先探测 /models，失败再试最小对话请求</span>
                  </div>
                </div>
              </div>
              <div v-if="showViteCorsProxy" class="tip-bar tip-warn tip-in-collapse">
                若出现 net::ERR_FAILED，多为浏览器 CORS。请开启上方「开发代理」并重启
                <code>npm run dev</code>。桌面端（<code>tauri:dev</code> / 安装包）已走 Rust
                HTTP，无需此开关。
              </div>
            </n-collapse-item>

            <n-collapse-item name="models">
              <template #header>
                <div class="collapse-header-row">
                  <span>模型</span>
                  <n-button
                    :loading="modelsLoading"
                    quaternary
                    size="tiny"
                    @click.stop="refreshModelLists"
                  >
                    <template #icon>
                      <n-icon :component="RefreshOutline" />
                    </template>
                    刷新列表
                  </n-button>
                </div>
              </template>
              <div class="field-grid">
                <div class="field">
                  <div class="field-label">对话模型</div>
                  <n-select
                    :loading="modelsLoading"
                    :options="chatModelOptions"
                    :render-label="renderSelectLabel"
                    :value="current.chatModel || null"
                    filterable
                    placeholder="gpt-4o / grok-4.5"
                    size="small"
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
                    size="small"
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
                    size="small"
                    tag
                    @update:value="(v) => patch('videoModel', v || '')"
                  />
                </div>
              </div>
            </n-collapse-item>
          </n-collapse>

          <div v-if="canRemoveCurrent" class="danger">
            <n-button quaternary size="small" type="error" @click="removeCurrent">
              <template #icon>
                <n-icon :component="TrashOutline" />
              </template>
              删除自定义提供商
            </n-button>
          </div>
          <div v-else class="tip-bar tip-muted tip-builtin">
            内置提供商不可删除；可用「恢复预设」重置，或添加自定义接口后再删。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./ProvidersSettings.scss"></style>
<style lang="scss">
/* Popover 内容 teleport 到 body，需非 scoped */
.provider-tips-popover .tips {
  margin: 0;
  padding-left: 18px;
  line-height: 1.6;
  font-size: 12px;
  color: var(--text-3);
}
</style>
