<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useMessage} from 'naive-ui'
import {AddOutline, RefreshOutline, TrashOutline} from '@vicons/ionicons5'
import {useSettingsStore} from '@/stores/settings'
import {isTauri, isLocalServerPage} from '@/utils/request'
import {
  fetchLocalServerInfo,
  regenerateLocalToken,
  setLocalServerConfig,
} from '@/utils/localServer'
import {syncStatus, syncError} from '@/utils/syncClient'
import {getAppVersion} from '@/utils/version'
import {checkForUpdate, installUpdateAndRelaunch} from '@/utils/updater'

const settings = useSettingsStore()
const message = useMessage()

const appVersion = ref('…')
const checkingUpdate = ref(false)
const installingUpdate = ref(false)
const updateProgress = ref('')
const updateResult = ref(null)
const pendingUpdate = ref(null)

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

onMounted(async () => {
  loadLocalInfo()
  appVersion.value = await getAppVersion()
})

async function onCheckUpdate() {
  if (!inTauri) {
    message.info('应用内更新仅支持桌面客户端')
    return
  }
  if (checkingUpdate.value || installingUpdate.value) return
  checkingUpdate.value = true
  updateResult.value = null
  pendingUpdate.value = null
  updateProgress.value = ''
  try {
    const result = await checkForUpdate()
    updateResult.value = result
    pendingUpdate.value = result.update
    if (result.hasUpdate) {
      settings.clearSkippedUpdateVersion()
      message.success(`发现新版本 ${result.latest.version}`)
    } else {
      message.info('当前已是最新版本')
    }
  } catch (e) {
    message.error(e?.message || '检查更新失败')
  } finally {
    checkingUpdate.value = false
  }
}

async function onInstallUpdate() {
  if (!pendingUpdate.value || installingUpdate.value) return
  installingUpdate.value = true
  updateProgress.value = '准备下载…'
  try {
    await installUpdateAndRelaunch(pendingUpdate.value, (event) => {
      if (event?.event === 'Started') {
        const total = event.data?.contentLength
        updateProgress.value = total ? `开始下载（${Math.round(total / 1024 / 1024)} MB）…` : '开始下载…'
      } else if (event?.event === 'Progress') {
        updateProgress.value = '正在下载更新…'
      } else if (event?.event === 'Finished') {
        updateProgress.value = '下载完成，准备重启…'
      }
    })
  } catch (e) {
    message.error(e?.message || '安装更新失败')
    installingUpdate.value = false
    updateProgress.value = ''
  }
}

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

function providerTypeLabel(type) {
  return providerTypeOptions.find((o) => o.value === type)?.label || type || '未分类'
}

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
      <div class="header-text">
        <div class="title">设置</div>
        <div class="desc">配置接口与模型，数据仅保存在本机</div>
      </div>
      <div class="actions">
        <n-button size="small" quaternary @click="reset">
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
          恢复预设
        </n-button>
        <n-button size="small" type="primary" @click="addCustom">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
          添加提供商
        </n-button>
      </div>
    </div>

    <div class="scroll">
      <div v-if="showLocalApiProxy" class="section">
        <n-alert :bordered="false" type="success" title="已通过本地服务访问">
          当前页面由桌面端本地服务托管。开启下方提供商的「使用本地 API 代理」即可绕过浏览器 CORS。
        </n-alert>
      </div>

      <div v-if="inTauri" class="section">
        <div class="section-card">
          <div class="section-head">
            <div>
              <div class="section-title">本地远程访问</div>
              <div class="section-desc">
                浏览器打开下方 URL，与桌面共享会话与设置，并可代理上游 AI API
              </div>
            </div>
            <n-button quaternary size="tiny" :loading="localLoading" @click="loadLocalInfo">
              刷新
            </n-button>
          </div>

          <n-alert
            v-if="draftLan || localInfo?.lanEnabled"
            :bordered="false"
            type="warning"
            title="局域网访问风险"
            class="mb"
          >
            同一网络内设备可打开含 token 的 URL，请勿转发；用完可重新生成 Token。
          </n-alert>

          <template v-if="localInfo">
            <div class="field-grid">
              <div class="field">
                <div class="field-label">状态同步</div>
                <div class="sync-row">
                  <n-tag
                    :type="syncStatus === 'connected' ? 'success' : syncStatus === 'connecting' ? 'warning' : 'default'"
                    size="small"
                    :bordered="false"
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
              </div>

              <div class="field field-full">
                <div class="field-label">访问 URL</div>
                <n-input
                  :value="localInfo.url"
                  readonly
                  size="small"
                  type="textarea"
                  :autosize="{ minRows: 1, maxRows: 2 }"
                />
                <div class="inline-actions">
                  <n-button size="tiny" @click="copyText(localInfo.url, 'URL')">复制</n-button>
                  <n-button size="tiny" type="primary" @click="openInBrowser">在浏览器打开</n-button>
                </div>
              </div>

              <div class="field">
                <div class="field-label">实际端口</div>
                <div class="inline-row">
                  <n-input
                    :value="String(localInfo.actualPort || localInfo.port)"
                    readonly
                    size="small"
                    style="max-width: 120px"
                  />
                  <n-button
                    size="tiny"
                    @click="copyText(String(localInfo.actualPort || localInfo.port), '端口')"
                  >
                    复制
                  </n-button>
                  <span class="hint">绑定 {{ localInfo.bind }}</span>
                </div>
              </div>

              <div class="field">
                <div class="field-label">偏好端口</div>
                <div class="inline-row">
                  <n-input-number
                    v-model:value="draftPort"
                    :min="1"
                    :max="65535"
                    :show-button="false"
                    size="small"
                    style="max-width: 120px"
                  />
                  <span class="hint">保存后需重启生效</span>
                </div>
              </div>

              <div class="field">
                <div class="field-label">允许局域网</div>
                <div class="inline-row">
                  <n-switch v-model:value="draftLan" size="small" />
                  <span class="hint">绑定 0.0.0.0，需重启</span>
                </div>
              </div>

              <div class="field">
                <div class="field-label">启用 API 代理</div>
                <div class="inline-row">
                  <n-switch v-model:value="draftProxy" size="small" />
                  <span class="hint">经 /api-proxy 转发，可热更新</span>
                </div>
              </div>

              <div class="field field-full">
                <div class="field-label">Token</div>
                <n-input
                  :value="localInfo.token"
                  readonly
                  size="small"
                  type="textarea"
                  :autosize="{ minRows: 1, maxRows: 2 }"
                />
                <div class="inline-actions">
                  <n-button size="tiny" @click="copyText(localInfo.token, 'Token')">复制</n-button>
                  <n-button
                    size="tiny"
                    secondary
                    type="warning"
                    :loading="localLoading"
                    @click="onRegenerateToken"
                  >
                    重新生成
                  </n-button>
                </div>
              </div>
            </div>

            <div class="section-foot">
              <n-button size="small" type="primary" :loading="savingConfig" @click="onSaveLocalConfig">
                保存本地服务配置
              </n-button>
            </div>
          </template>
          <n-spin v-else :show="localLoading">
            <div class="local-empty">加载中…</div>
          </n-spin>
        </div>
      </div>

      <div class="section">
        <div class="section-card">
          <div class="section-head">
            <div>
              <div class="section-title">关于与更新</div>
              <div class="section-desc">
                {{ inTauri ? '通过 Tauri Updater 检查并安装更新' : '应用内更新仅桌面客户端可用' }}
              </div>
            </div>
            <n-tag :bordered="false" size="small">v{{ appVersion }}</n-tag>
          </div>

          <div class="field-grid">
            <div class="field">
              <div class="field-label">启动时自动检查</div>
              <div class="inline-row">
                <n-switch
                  size="small"
                  :disabled="!inTauri"
                  :value="settings.autoCheckUpdate"
                  @update:value="(v) => settings.setAutoCheckUpdate(v)"
                />
                <span class="hint">有更新时弹窗提示安装</span>
              </div>
            </div>

            <div class="field">
              <div class="field-label">手动检查</div>
              <n-button
                size="small"
                type="primary"
                :disabled="!inTauri || installingUpdate"
                :loading="checkingUpdate"
                @click="onCheckUpdate"
              >
                检查更新
              </n-button>
            </div>
          </div>

          <div v-if="updateResult" class="update-result">
            <template v-if="updateResult.hasUpdate">
              <div class="update-line">
                发现新版本
                <strong>v{{ updateResult.latest.version }}</strong>
                （当前 v{{ updateResult.currentVersion }}）
              </div>
              <div v-if="updateResult.latest.body" class="hint update-notes">
                {{ updateResult.latest.body }}
              </div>
              <div class="inline-actions">
                <n-button
                  size="tiny"
                  type="primary"
                  :loading="installingUpdate"
                  @click="onInstallUpdate"
                >
                  下载并安装
                </n-button>
              </div>
              <div v-if="updateProgress" class="hint">{{ updateProgress }}</div>
            </template>
            <template v-else>
              <div class="update-line">当前已是最新版本（v{{ updateResult.currentVersion }}）</div>
            </template>
          </div>
        </div>
      </div>

      <div class="section body">
        <aside class="list-panel">
          <div class="list-label">提供商</div>
          <div class="list">
            <button
              v-for="p in settings.providers"
              :key="p.id"
              type="button"
              :class="{ active: p.id === selectedId }"
              class="item"
              @click="onSelect(p.id)"
            >
              <div class="item-top">
                <span class="name">{{ p.name }}</span>
                <span v-if="p.id === settings.activeProviderId" class="badge">当前</span>
              </div>
              <div class="meta">{{ providerTypeLabel(p.provider) }}</div>
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
            </div>

            <div class="field-grid">
              <div class="field">
                <div class="field-label">名称</div>
                <n-input
                  size="small"
                  :value="current.name"
                  placeholder="例如 OpenAI / Grok / 中转站"
                  @update:value="(v) => patch('name', v)"
                />
              </div>

              <div class="field">
                <div class="field-label">接口类型</div>
                <n-select
                  size="small"
                  :options="providerTypeOptions"
                  :value="current.provider"
                  @update:value="(v) => patch('provider', v)"
                />
              </div>

              <div class="field field-full">
                <div class="field-label">Base URL</div>
                <n-input
                  size="small"
                  :value="current.baseUrl"
                  placeholder="https://api.openai.com/v1"
                  @update:value="(v) => patch('baseUrl', v)"
                />
              </div>

              <div class="field field-full">
                <div class="field-label">API Key</div>
                <n-input
                  size="small"
                  :value="current.apiKey"
                  placeholder="sk-..."
                  show-password-on="click"
                  type="password"
                  @update:value="(v) => patch('apiKey', v)"
                />
              </div>

              <div v-if="showViteCorsProxy" class="field field-full">
                <div class="field-label">开发代理（绕过 CORS）</div>
                <div class="inline-row">
                  <n-switch
                    size="small"
                    :value="Boolean(current.useCorsProxy)"
                    @update:value="(v) => patch('useCorsProxy', v)"
                  />
                  <span class="hint">浏览器 npm run dev 访问中转站时请开启</span>
                </div>
              </div>

              <div v-if="showLocalApiProxy" class="field field-full">
                <div class="field-label">使用本地 API 代理</div>
                <div class="inline-row">
                  <n-switch
                    size="small"
                    :value="Boolean(current.useCorsProxy)"
                    @update:value="(v) => patch('useCorsProxy', v)"
                  />
                  <span class="hint">经本地服务 /api-proxy 转发</span>
                </div>
              </div>

              <div class="field">
                <div class="field-label">对话模型</div>
                <n-input
                  size="small"
                  :value="current.chatModel"
                  placeholder="gpt-4o / grok-4"
                  @update:value="(v) => patch('chatModel', v)"
                />
              </div>

              <div class="field">
                <div class="field-label">生图模型</div>
                <n-input
                  size="small"
                  :value="current.imageModel"
                  placeholder="gpt-image-1 / grok-imagine-image"
                  @update:value="(v) => patch('imageModel', v)"
                />
              </div>
            </div>

            <n-alert
              v-if="showViteCorsProxy"
              :bordered="false"
              title="若出现 net::ERR_FAILED"
              type="warning"
              class="mt"
            >
              多为浏览器 CORS。请开启上方「开发代理」并重启 `npm run dev`；或改用 `npm run tauri:dev`。
            </n-alert>

            <n-alert
              v-if="showLocalApiProxy"
              :bordered="false"
              title="本地 API 代理"
              type="info"
              class="mt"
            >
              请求将打到同源 `/api-proxy`，由桌面本地服务按 Header `X-Proxy-Target` 转发；需桌面端开启「启用 API 代理」。
            </n-alert>

            <div class="tips-block">
              <div class="tips-title">使用说明</div>
              <ul class="tips">
                <li>对话：POST {BaseURL}/chat/completions（支持流式）</li>
                <li>文生图：POST {BaseURL}/images/generations</li>
                <li>图生图：OpenAI 用 multipart /images/edits；xAI 用 JSON /images/edits</li>
                <li>任意 OpenAI 兼容中转站，填对应 Base URL + Key 即可</li>
              </ul>
            </div>

            <div class="danger">
              <n-button size="small" quaternary type="error" @click="removeCurrent">
                <template #icon>
                  <n-icon :component="TrashOutline" />
                </template>
                删除此提供商
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  flex-shrink: 0;
}

.header-text {
  min-width: 0;
}

.title {
  font-size: 16px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.desc {
  margin-top: 2px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section {
  flex-shrink: 0;
}

.section-card {
  border-radius: 14px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
}

.section-desc {
  margin-top: 3px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.5;
}

.section-foot {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 14px;
}

.field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-full {
  grid-column: 1 / -1;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
}

.inline-row,
.inline-actions,
.sync-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.38);
}

.sync-err {
  font-size: 12px;
  color: rgba(255, 120, 120, 0.85);
}

.local-empty {
  min-height: 40px;
  color: rgba(255, 255, 255, 0.35);
  font-size: 13px;
}

.mb {
  margin-bottom: 12px;
}

.mt {
  margin-top: 12px;
}

.body {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
  flex: 1;
  min-height: 0;
}

.list-panel {
  position: sticky;
  top: 0;
  border-radius: 14px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.list-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  padding: 0 4px 8px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(62vh, 560px);
  overflow: auto;
}

.item {
  width: 100%;
  text-align: left;
  padding: 10px 11px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: inherit;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.035);
  }

  &.active {
    border-color: rgba(124, 156, 255, 0.35);
    background: rgba(124, 156, 255, 0.1);
  }
}

.item-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  color: #9bb2ff;
  background: rgba(124, 156, 255, 0.16);
}

.meta {
  margin-top: 3px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.url {
  margin-top: 2px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.28);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-panel {
  min-width: 0;
}

.form-card {
  max-width: 760px;
}

.tips-block {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.tips-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 6px;
}

.tips {
  margin: 0;
  padding-left: 16px;
  line-height: 1.65;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

.danger {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.update-result {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.update-line {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.78);

  strong {
    color: #9bb2ff;
    font-weight: 650;
  }
}

.update-notes {
  white-space: pre-wrap;
  max-height: 120px;
  overflow: auto;
}

@media (max-width: 1023.98px) {
  .header {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 14px;
  }

  .actions {
    width: 100%;
  }

  .scroll {
    padding: 12px 14px 16px;
  }

  .body {
    grid-template-columns: 1fr;
  }

  .list-panel {
    position: static;
  }

  .list {
    max-height: 168px;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
  }

  .item {
    min-width: 180px;
    flex-shrink: 0;
  }
}

@media (max-width: 767.98px) {
  .field-grid {
    grid-template-columns: 1fr;
  }

  .actions {
    flex-wrap: wrap;
  }

  .hint {
    width: 100%;
  }
}
</style>
