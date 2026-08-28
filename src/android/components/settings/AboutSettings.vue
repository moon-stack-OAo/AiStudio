<script setup>
import {computed, onMounted, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {clearAppStorage} from '@core/utils/storage'
import {clearImageCache} from '@core/utils/imageCache'
import {isAndroidTauri} from '@core/utils/request'
import {getAppVersion} from '@core/utils/version'
import {
  checkAndroidUpdate,
  downloadAndInstallAndroidUpdate,
  openAndroidApkInBrowser,
} from '@core/utils/androidUpdater'
import {CHAT_CONTEXT_MAX_TURNS_OPTIONS} from '@core/utils/constants'
import {renderSelectLabel} from '@core/utils/selectRender'

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

const maxTurnsOptions = computed(() =>
  CHAT_CONTEXT_MAX_TURNS_OPTIONS.map((n) => ({
    label: `${n} 轮`,
    value: n,
  })),
)

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
        updateProgress.value = total
          ? `正在下载 ${done} / ${total}…`
          : `正在下载 ${done || '…'}…`
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

function onClearLocalData() {
  if (clearing.value) return
  dialog.warning({
    title: '清除本地数据',
    content:
      '将清除本机保存的提供商配置、对话 / 生图 / 生视频记录（含 API Key 与图片缓存）。清除后页面会刷新。',
    positiveText: '确认清除',
    negativeText: '取消',
    onPositiveClick: async () => {
      clearing.value = true
      try {
        clearAppStorage()
        try {
          await clearImageCache()
        } catch {
          /* ignore */
        }
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
              <n-button
                :loading="installingUpdate"
                block
                type="primary"
                @click="onInstallUpdate"
              >
                下载并安装
              </n-button>
              <n-button
                :disabled="installingUpdate"
                block
                secondary
                @click="onOpenApkLink"
              >
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
            <div class="section-title">对话上下文</div>
            <div class="section-desc">
              发送请求时仅携带最近若干轮，避免超长历史撞上模型上限；本地会话记录仍完整保留
            </div>
          </div>
        </div>
        <div class="data-row">
          <div class="inline-row">
            <n-switch
              :value="settings.chatContextTrimEnabled"
              @update:value="(v) => settings.setChatContextTrimEnabled(v)"
            />
            <span class="field-label tight">自动裁剪上下文</span>
          </div>
          <n-select
            :disabled="!settings.chatContextTrimEnabled"
            :options="maxTurnsOptions"
            :render-label="renderSelectLabel"
            :value="settings.chatContextMaxTurns"
            class="select-turns"
            @update:value="(v) => settings.setChatContextMaxTurns(v)"
          />
        </div>
        <div class="hint context-extra-hint">
          1 轮 = 一次用户提问及其后回复；接近上限时对话页会提示
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">本地数据</div>
            <div class="section-desc">清除提供商、对话、生图、生视频等前端缓存</div>
          </div>
        </div>
        <div class="data-row">
          <div class="hint">
            仅清除浏览器 / WebView 中的本地缓存数据。
          </div>
          <n-button
            :loading="clearing"
            block
            secondary
            type="error"
            @click="onClearLocalData"
          >
            清除本地数据
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./AboutSettings.scss"></style>
