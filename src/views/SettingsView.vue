<script setup>
import {computed, ref, watch} from 'vue'
import {useMessage} from 'naive-ui'
import {useSettingsStore} from '@/stores/settings'

const settings = useSettingsStore()
const message = useMessage()

const selectedId = ref(settings.activeProviderId)

watch(
  () => settings.activeProviderId,
  (id) => {
    selectedId.value = id
  },
)

const current = computed(() =>
  settings.providers.find((p) => p.id === selectedId.value),
)

const providerTypeOptions = [
  { label: 'OpenAI / 兼容接口', value: 'openai' },
  { label: 'OpenAI Compatible', value: 'openai-compatible' },
  { label: 'xAI Grok', value: 'xai' },
]

function onSelect(id) {
  selectedId.value = id
  settings.setActiveProvider(id)
}

function patch(field, value) {
  if (!current.value) return
  settings.updateProvider(current.value.id, { [field]: value })
}

function addCustom() {
  const item = settings.addProvider({
    name: '自定义接口',
    baseUrl: '',
    apiKey: '',
    chatModel: 'gpt-4o',
    imageModel: 'dall-e-3',
    provider: 'openai-compatible',
  })
  selectedId.value = item.id
  message.success('已添加自定义提供商')
}

function removeCurrent() {
  if (!current.value) return
  const ok = settings.removeProvider(current.value.id)
  if (!ok) {
    message.warning('至少保留一个提供商')
    return
  }
  selectedId.value = settings.activeProviderId
  message.success('已删除')
}

function reset() {
  settings.resetPresets()
  selectedId.value = settings.activeProviderId
  message.success('已恢复默认预设')
}
</script>

<template>
  <div class="settings-page">
    <div class="header">
      <div>
        <div class="title">设置</div>
        <div class="desc">配置 Base URL、API Key 与模型。数据仅保存在浏览器本地。</div>
      </div>
      <div class="actions">
        <n-button @click="addCustom">添加提供商</n-button>
        <n-button quaternary @click="reset">恢复预设</n-button>
      </div>
    </div>

    <div class="body">
      <div class="list">
        <div
          v-for="p in settings.providers"
          :key="p.id"
          :class="{ active: p.id === selectedId }"
          class="item"
          @click="onSelect(p.id)"
        >
          <div class="name">{{ p.name }}</div>
          <div class="url">{{ p.baseUrl || '未填写 Base URL' }}</div>
        </div>
      </div>

      <div v-if="current" class="form">
        <n-form label-placement="top">
          <n-form-item label="名称">
            <n-input
              :value="current.name"
              placeholder="例如 OpenAI / Grok / 中转站"
              @update:value="(v) => patch('name', v)"
            />
          </n-form-item>

          <n-form-item label="接口类型">
            <n-select
              :options="providerTypeOptions"
              :value="current.provider"
              @update:value="(v) => patch('provider', v)"
            />
          </n-form-item>

          <n-form-item label="Base URL">
            <n-input
              :value="current.baseUrl"
              placeholder="https://api.openai.com/v1"
              @update:value="(v) => patch('baseUrl', v)"
            />
          </n-form-item>

          <n-form-item label="API Key">
            <n-input
              :value="current.apiKey"
              placeholder="sk-..."
              show-password-on="click"
              type="password"
              @update:value="(v) => patch('apiKey', v)"
            />
          </n-form-item>

          <n-form-item label="开发代理（绕过 CORS）">
            <n-switch
              :value="Boolean(current.useCorsProxy)"
              @update:value="(v) => patch('useCorsProxy', v)"
            />
            <span class="switch-hint">浏览器 npm run dev 访问中转站时请开启；仅开发服生效</span>
          </n-form-item>

          <n-grid :cols="2" :x-gap="12">
            <n-gi>
              <n-form-item label="对话模型">
                <n-input
                  :value="current.chatModel"
                  placeholder="gpt-4o / grok-4"
                  @update:value="(v) => patch('chatModel', v)"
                />
              </n-form-item>
            </n-gi>
            <n-gi>
              <n-form-item label="生图模型">
                <n-input
                  :value="current.imageModel"
                  placeholder="gpt-image-1 / grok-imagine-image"
                  @update:value="(v) => patch('imageModel', v)"
                />
              </n-form-item>
            </n-gi>
          </n-grid>

          <n-alert :bordered="false" title="若出现 net::ERR_FAILED" type="warning">
            多为浏览器 CORS。浏览器开发请开启上方「开发代理」并重启 `npm run dev`；或改用 `npm run tauri:dev`。
          </n-alert>

          <n-alert :bordered="false" style="margin-top: 12px" title="使用说明" type="info">
            <ul class="tips">
              <li>对话：POST {BaseURL}/chat/completions（支持流式）</li>
              <li>文生图：POST {BaseURL}/images/generations</li>
              <li>图生图：OpenAI 用 multipart /images/edits；xAI 用 JSON /images/edits</li>
              <li>任意 OpenAI 兼容中转站，填对应 Base URL + Key 即可</li>
            </ul>
          </n-alert>

          <div class="danger">
            <n-button secondary type="error" @click="removeCurrent">删除此提供商</n-button>
          </div>
        </n-form>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.title {
  font-size: 18px;
  font-weight: 650;
}

.desc {
  margin-top: 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
}

.actions {
  display: flex;
  gap: 8px;
}

.body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px 1fr;
}

.list {
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  overflow: auto;
  padding: 12px;
}

.item {
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 8px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.02);

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  &.active {
    border-color: rgba(124, 156, 255, 0.45);
    background: rgba(124, 156, 255, 0.1);
  }
}

.name {
  font-size: 14px;
  font-weight: 600;
}

.url {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form {
  padding: 18px 22px;
  overflow: auto;
  max-width: 820px;
}

.tips {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
  font-size: 13px;
}

.danger {
  margin-top: 18px;
}

.switch-hint {
  margin-left: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

@media (max-width: 1023.98px) {
  .header {
    flex-direction: column;
    padding: 14px 16px;
  }

  .body {
    grid-template-columns: 1fr;
  }

  .list {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    max-height: 180px;
  }

  .form {
    padding: 14px 16px;
    max-width: none;
  }
}

@media (max-width: 767.98px) {
  .actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .switch-hint {
    display: block;
    margin-left: 0;
    margin-top: 8px;
  }
}
</style>
