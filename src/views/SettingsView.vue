<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useMessage} from 'naive-ui'
import {useSettingsStore} from '@/stores/settings'
import {isTauri, isLocalServerPage} from '@/utils/request'
import {
  fetchLocalServerInfo,
  regenerateLocalToken,
  setLocalServerConfig,
} from '@/utils/localServer'
import {syncStatus, syncError} from '@/utils/syncClient'

const settings = useSettingsStore()
const message = useMessage()

/** 浏览器开发态（非本地服务页）：Vite 开发代理 */
const showViteCorsProxy = import.meta.env.DEV && !isTauri() && !isLocalServerPage()
/** 经本地服务打开的浏览器：使用本地 API 代理开关（复用 useCorsProxy） */
const showLocalApiProxy = isLocalServerPage()

/** 仅桌面端显示「本地远程访问」配置 */
const inTauri = isTauri()
const localInfo = ref(null)
const localLoading = ref(false)
const savingConfig = ref(false)

/** 可编辑草稿（保存后才写入 Rust） */
const draftPort = ref(17890)
const draftLan = ref(false)
const draftProxy = ref(true)

async function loadLocalInfo() {
  if (!inTauri && !showLocalApiProxy) return
  localLoading.value = true
  try {
    localInfo.value = await fetchLocalServerInfo()
    if (localInfo.value) {
      draftPort.value = Number(localInfo.value.preferredPort || localInfo.value.port || 17890)
      draftLan.value = Boolean(localInfo.value.lanEnabled)
      draftProxy.value = localInfo.value.proxyEnabled !== false
    }
  } catch (e) {
    message.error(e?.message || '获取本地服务信息失败')
  } finally {
    localLoading.value = false
  }
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    message.success(`已复制${label}`)
  } catch {
    message.error('复制失败')
  }
}

function openInBrowser() {
  if (!localInfo.value?.url) return
  window.open(localInfo.value.url, '_blank')
}

async function onRegenerateToken() {
  localLoading.value = true
  try {
    localInfo.value = await regenerateLocalToken()
    message.success('已重新生成 token，请使用新 URL 访问')
  } catch (e) {
    message.error(e?.message || '重新生成失败')
  } finally {
    localLoading.value = false
  }
}

async function onSaveLocalConfig() {
  savingConfig.value = true
  try {
    const port = Number(draftPort.value)
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      message.error('端口需为 1–65535')
      return
    }
    const result = await setLocalServerConfig({
      port,
      lanEnabled: Boolean(draftLan.value),
      proxyEnabled: Boolean(draftProxy.value),
    })
    localInfo.value = result
    draftPort.value = Number(result.preferredPort || result.port || port)
    draftLan.value = Boolean(result.lanEnabled)
    draftProxy.value = result.proxyEnabled !== false
    message.success('配置已保存')
    if (result.needRestart) {
      message.warning('修改端口或局域网绑定需重启应用后生效')
    }
  } catch (e) {
    message.error(e?.message || '保存配置失败')
  } finally {
    savingConfig.value = false
  }
}

onMounted(() => {
  loadLocalInfo()
})

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

    <div v-if="showLocalApiProxy" class="local-remote">
      <n-alert :bordered="false" type="success" title="已通过本地服务访问">
        当前页面由桌面端本地服务托管。开启下方提供商的「使用本地 API 代理」即可绕过浏览器 CORS。
      </n-alert>
    </div>

    <div v-if="inTauri" class="local-remote">
      <n-card :bordered="false" size="small" title="本地远程访问">
        <template #header-extra>
          <n-button quaternary size="small" :loading="localLoading" @click="loadLocalInfo">
            刷新
          </n-button>
        </template>
        <p class="local-desc">
          默认仅本机 127.0.0.1。在系统浏览器打开下方 URL 即可与桌面共享会话与设置（WebSocket
          近实时同步），并可经本地服务代理上游 AI API。
        </p>
        <n-alert
          v-if="draftLan || localInfo?.lanEnabled"
          :bordered="false"
          type="warning"
          title="局域网访问风险"
          style="margin-bottom: 12px"
        >
          已允许局域网访问时，同一网络内设备可打开含 token 的 URL。请勿转发该链接；用完可重新生成
          Token。
        </n-alert>
        <n-form v-if="localInfo" label-placement="left" label-width="108">
          <n-form-item label="状态同步">
            <div class="sync-row">
              <n-tag
                :type="syncStatus === 'connected' ? 'success' : syncStatus === 'connecting' ? 'warning' : 'default'"
                size="small"
              >
                {{
                  syncStatus === 'connected'
                    ? '已连接'
                    : syncStatus === 'connecting'
                      ? '连接中…'
                      : '未连接'
                }}
              </n-tag>
              <span v-if="syncError" class="sync-err">{{ syncError }}</span>
            </div>
          </n-form-item>
          <n-form-item label="访问 URL">
            <n-input :value="localInfo.url" readonly type="textarea" :autosize="{ minRows: 1, maxRows: 3 }" />
            <div class="local-actions">
              <n-button size="small" @click="copyText(localInfo.url, 'URL')">复制</n-button>
              <n-button size="small" type="primary" @click="openInBrowser">在浏览器打开</n-button>
            </div>
          </n-form-item>
          <n-form-item label="实际端口">
            <n-input :value="String(localInfo.actualPort || localInfo.port)" readonly style="max-width: 160px" />
            <n-button
              size="small"
              class="ml"
              @click="copyText(String(localInfo.actualPort || localInfo.port), '端口')"
            >
              复制
            </n-button>
            <span class="switch-hint">绑定 {{ localInfo.bind }}</span>
          </n-form-item>
          <n-form-item label="偏好端口">
            <n-input-number
              v-model:value="draftPort"
              :min="1"
              :max="65535"
              :show-button="false"
              style="max-width: 160px"
            />
            <span class="switch-hint">保存后需重启应用生效</span>
          </n-form-item>
          <n-form-item label="允许局域网">
            <n-switch v-model:value="draftLan" />
            <span class="switch-hint">绑定 0.0.0.0，需重启应用生效</span>
          </n-form-item>
          <n-form-item label="启用 API 代理">
            <n-switch v-model:value="draftProxy" />
            <span class="switch-hint">供浏览器经 /api-proxy 转发上游 AI；可热更新</span>
          </n-form-item>
          <n-form-item label="Token">
            <n-input :value="localInfo.token" readonly type="textarea" :autosize="{ minRows: 1, maxRows: 2 }" />
            <div class="local-actions">
              <n-button size="small" @click="copyText(localInfo.token, 'Token')">复制</n-button>
              <n-button size="small" secondary type="warning" :loading="localLoading" @click="onRegenerateToken">
                重新生成 Token
              </n-button>
            </div>
          </n-form-item>
          <n-form-item label=" ">
            <n-button type="primary" :loading="savingConfig" @click="onSaveLocalConfig">
              保存本地服务配置
            </n-button>
          </n-form-item>
        </n-form>
        <n-spin v-else :show="localLoading">
          <div class="local-empty">加载中…</div>
        </n-spin>
      </n-card>
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

          <n-form-item v-if="showViteCorsProxy" label="开发代理（绕过 CORS）">
            <n-switch
              :value="Boolean(current.useCorsProxy)"
              @update:value="(v) => patch('useCorsProxy', v)"
            />
            <span class="switch-hint">浏览器 npm run dev 访问中转站时请开启；仅开发服生效</span>
          </n-form-item>

          <n-form-item v-if="showLocalApiProxy" label="使用本地 API 代理">
            <n-switch
              :value="Boolean(current.useCorsProxy)"
              @update:value="(v) => patch('useCorsProxy', v)"
            />
            <span class="switch-hint">经本地服务 /api-proxy 转发，绕过浏览器 CORS</span>
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

          <n-alert
            v-if="showViteCorsProxy"
            :bordered="false"
            title="若出现 net::ERR_FAILED"
            type="warning"
          >
            多为浏览器 CORS。浏览器开发请开启上方「开发代理」并重启 `npm run dev`；或改用 `npm run tauri:dev`。
          </n-alert>

          <n-alert
            v-if="showLocalApiProxy"
            :bordered="false"
            title="本地 API 代理"
            type="info"
            style="margin-top: 12px"
          >
            请求将打到同源 `/api-proxy`，由桌面本地服务按 Header `X-Proxy-Target` 转发；需桌面端开启「启用 API 代理」。
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

.local-remote {
  padding: 12px 22px 0;
}

.local-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
}

.local-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.local-empty {
  min-height: 48px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.sync-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sync-err {
  font-size: 12px;
  color: rgba(255, 120, 120, 0.85);
}

.ml {
  margin-left: 8px;
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
  .local-remote {
    padding: 12px 16px 0;
  }

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
