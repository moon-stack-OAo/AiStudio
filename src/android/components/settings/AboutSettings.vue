<script setup>
import {onMounted, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {clearAppStorage, removeKey} from '@core/utils/storage'
import {clearImageCache} from '@core/utils/imageCache'
import {isAndroidTauri} from '@core/utils/request'
import {getAppVersion} from '@core/utils/version'
import {
  checkAndroidUpdate,
  downloadAndInstallAndroidUpdate,
  openAndroidApkInBrowser,
} from '@core/utils/androidUpdater'

const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const inAndroid = isAndroidTauri()

const appVersion = ref('…')
const checkingUpdate = ref(false)
const installingUpdate = ref(false)
const clearing = ref(false)
const updateProgress = ref('')
const updateResult = ref(null)
const pendingLatest = ref(null)

const SESSION_KEYS = ['chat_sessions', 'image_sessions', 'video_sessions']

onMounted(async () => {
  appVersion.value = await getAppVersion()
})

function formatBytes(n) {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

async function onCheckUpdate() {
  if (!inAndroid) {
    message.info('应用内更新仅支持 Android 客户端')
    return
  }
  if (checkingUpdate.value || installingUpdate.value) return
  checkingUpdate.value = true
  updateResult.value = null
  pendingLatest.value = null
  updateProgress.value = ''
  try {
    const result = await checkAndroidUpdate()
    updateResult.value = result
    pendingLatest.value = result.latest
    if (result.hasUpdate) {
      settings.clearSkippedUpdateVersion()
      settings.setAvailableUpdate(result.latest.version)
      message.success(`发现新版本 ${result.latest.version}`)
    } else {
      settings.clearAvailableUpdate()
      message.info('当前已是最新版本')
    }
  } catch (e) {
    message.error(e?.message || '检查更新失败')
  } finally {
    checkingUpdate.value = false
  }
}

async function onInstallUpdate() {
  if (!pendingLatest.value || installingUpdate.value) return
  installingUpdate.value = true
  updateProgress.value = '准备下载…'
  try {
    await downloadAndInstallAndroidUpdate(pendingLatest.value, (info) => {
      if (info.phase === 'permission') {
        updateProgress.value = '检查安装权限…'
      } else if (info.phase === 'download') {
        const done = formatBytes(info.downloaded)
        const total = formatBytes(info.total)
        updateProgress.value = total ? `正在下载 ${done} / ${total}…` : `正在下载 ${done || '…'}…`
      } else if (info.phase === 'install') {
        updateProgress.value = '下载完成，正在调起系统安装器…'
      }
    })
    message.success('已调起系统安装器，请按提示完成安装')
    updateProgress.value = '已调起安装器。若未弹出，请检查「允许安装未知应用」。'
  } catch (e) {
    message.error(e?.message || '安装更新失败')
    updateProgress.value = ''
  } finally {
    installingUpdate.value = false
  }
}

async function onOpenApkLink() {
  if (!pendingLatest.value?.url) return
  try {
    await openAndroidApkInBrowser(pendingLatest.value.url)
  } catch (e) {
    message.error(e?.message || '打开下载链接失败')
  }
}

async function clearSessionData() {
  for (const key of SESSION_KEYS) {
    removeKey(key)
  }
  try {
    await clearImageCache()
  } catch {
    /* ignore */
  }
}

async function clearAllLocalData() {
  clearAppStorage()
  try {
    await clearImageCache()
  } catch {
    /* ignore */
  }
}

function onClearSessions() {
  if (clearing.value) return
  dialog.warning({
    title: '仅清除会话数据',
    content:
      '将清除对话 / 生图 / 生视频本地记录与图片缓存，保留提供商与 API Key。清除后页面会刷新。',
    positiveText: '确认清除',
    negativeText: '取消',
    onPositiveClick: async () => {
      clearing.value = true
      try {
        await clearSessionData()
        window.location.reload()
      } catch (e) {
        message.error(e?.message || '清除失败')
        clearing.value = false
      }
    },
  })
}

function onClearApiKeys() {
  dialog.warning({
    title: '仅清除 API Key',
    content: '将清空所有提供商的 API Key 并保存，会话与其它配置保留。',
    positiveText: '确认清除',
    negativeText: '取消',
    onPositiveClick: () => {
      settings.clearAllApiKeys()
      message.success('已清除全部 API Key')
    },
  })
}

function onClearAll() {
  if (clearing.value) return
  dialog.warning({
    title: '全部清除',
    content:
      '将清除提供商配置、对话 / 生图 / 生视频记录（含 API Key 与图片缓存）。清除后页面会刷新。',
    positiveText: '确认清除',
    negativeText: '取消',
    onPositiveClick: async () => {
      clearing.value = true
      try {
        await clearAllLocalData()
        window.location.reload()
      } catch (e) {
        message.error(e?.message || '清除失败')
        clearing.value = false
      }
    },
  })
}
</script>

<template>
  <div class="tab-pane about-pane">
    <div class="about-wrap">
      <div class="version-card">
        <div class="version-badge">v{{ appVersion }}</div>
        <div class="version-app">AI Studio</div>
        <div class="version-desc">
          {{
            inAndroid
              ? '通过侧载清单检查更新，下载 APK 后由系统安装器完成安装'
              : '应用内更新仅 Android 客户端可用'
          }}
        </div>
      </div>

      <div class="section-card update-card">
        <div class="section-head">
          <div>
            <div class="section-title">更新</div>
            <div class="section-desc">检查新版本并安装</div>
          </div>
        </div>

        <div class="update-row">
          <div class="inline-row">
            <n-switch
              :disabled="!inAndroid"
              :value="settings.autoCheckUpdate"
              @update:value="(v) => settings.setAutoCheckUpdate(v)"
            />
            <span class="field-label tight">启动时自动检查</span>
          </div>
          <n-button
            :disabled="!inAndroid || installingUpdate"
            :loading="checkingUpdate"
            block
            type="primary"
            @click="onCheckUpdate"
          >
            检查更新
          </n-button>
        </div>

        <div
          v-if="updateResult"
          :class="updateResult.hasUpdate ? 'status-updatable' : 'status-ok'"
          class="status-bar"
        >
          <template v-if="updateResult.hasUpdate">
            <div class="status-main">
              发现新版本
              <strong>v{{ updateResult.latest.version }}</strong>
              <span class="status-sub">（当前 v{{ updateResult.currentVersion }}）</span>
            </div>
            <div v-if="updateResult.latest.body" class="hint update-notes">
              {{ updateResult.latest.body }}
            </div>
            <div class="inline-actions">
              <n-button :loading="installingUpdate" block type="primary" @click="onInstallUpdate">
                下载并安装
              </n-button>
              <n-button :disabled="installingUpdate" block secondary @click="onOpenApkLink">
                浏览器打开 APK
              </n-button>
            </div>
            <div v-if="updateProgress" class="hint">{{ updateProgress }}</div>
            <div class="hint">
              首次安装需在系统设置中允许本应用「安装未知应用」。安装完成后请按提示确认。
            </div>
          </template>
          <template v-else>
            <div class="status-main">当前已是最新版本（v{{ updateResult.currentVersion }}）</div>
          </template>
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">本地数据</div>
            <div class="section-desc">可仅清会话、仅清 API Key，或全部清除</div>
          </div>
        </div>
        <div class="data-row">
          <n-button :loading="clearing" block secondary @click="onClearSessions">
            仅清除会话
          </n-button>
          <n-button :disabled="clearing" block secondary @click="onClearApiKeys">
            仅清除 API Key
          </n-button>
          <n-button :loading="clearing" block secondary type="error" @click="onClearAll">
            全部清除
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./AboutSettings.scss"></style>
