<script setup>
import {onMounted, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {clearAppStorage, removeKey} from '@core/utils/storage'
import {clearImageCache} from '@core/utils/imageCache'
import {isDesktopTauri} from '@core/utils/request'
import {getAppVersion} from '@core/utils/version'
import {renderSelectLabel} from '@core/utils/selectRender'
import {useAppUpdater} from '@/composables/useAppUpdater'

const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const inTauri = isDesktopTauri()

const {
  checking: checkingUpdate,
  installing: installingUpdate,
  updateProgress,
  updateResult,
  checkUpdate,
  installUpdate,
} = useAppUpdater()

const appVersion = ref('…')
const clearing = ref(false)
const closePref = ref('ask')
const savingClosePref = ref(false)

const closePrefOptions = [
  {label: '每次询问', value: 'ask'},
  {label: '直接退出', value: 'quit'},
  {label: '最小化到托盘', value: 'tray'},
]

const SESSION_KEYS = ['chat_sessions', 'image_sessions', 'video_sessions']

onMounted(async () => {
  appVersion.value = await getAppVersion()
  if (inTauri) {
    try {
      const {invoke} = await import('@tauri-apps/api/core')
      closePref.value = await invoke('get_close_action_pref')
    } catch {
      closePref.value = 'ask'
    }
  }
})

async function onClosePrefChange(value) {
  if (!inTauri || savingClosePref.value) return
  savingClosePref.value = true
  try {
    const {invoke} = await import('@tauri-apps/api/core')
    await invoke('set_close_action_pref', {action: value})
    closePref.value = value
    message.success('已更新关闭行为')
  } catch (e) {
    message.error(e?.message || '保存失败')
  } finally {
    savingClosePref.value = false
  }
}

async function onCheckUpdate() {
  const result = await checkUpdate({silent: false})
  if (result?.hasUpdate) {
    message.success(`发现新版本 ${result.latest.version}`)
  }
}

function onInstallUpdate() {
  return installUpdate()
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
      '将清除提供商配置、对话 / 生图 / 生视频记录（含 API Key 与图片缓存）。清除后页面会刷新。桌面关闭偏好保存在 window_prefs.json，不会被重置。',
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
          {{ inTauri ? '通过 Tauri Updater 检查并安装更新' : '应用内更新仅桌面客户端可用' }}
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
              :disabled="!inTauri"
              :value="settings.autoCheckUpdate"
              size="small"
              @update:value="(v) => settings.setAutoCheckUpdate(v)"
            />
            <span class="field-label tight">启动时自动检查</span>
          </div>
          <n-button
            :disabled="!inTauri || installingUpdate"
            :loading="checkingUpdate"
            size="small"
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
                size="tiny"
                type="primary"
                @click="onInstallUpdate"
              >
                下载并安装
              </n-button>
            </div>
            <div v-if="updateProgress" class="hint">{{ updateProgress }}</div>
          </template>
          <template v-else>
            <div class="status-main">当前已是最新版本（v{{ updateResult.currentVersion }}）</div>
          </template>
        </div>
      </div>

      <div v-if="inTauri" class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">关闭行为</div>
            <div class="section-desc">点击窗口关闭时的默认动作</div>
          </div>
        </div>
        <div class="data-row">
          <n-select
            :loading="savingClosePref"
            :options="closePrefOptions"
            :render-label="renderSelectLabel"
            :value="closePref"
            class="select-close"
            size="small"
            @update:value="onClosePrefChange"
          />
          <div class="hint">选择「每次询问」后，关闭时会再次弹出提示</div>
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">本地数据</div>
            <div class="section-desc">
              可仅清会话、仅清 API Key，或全部清除。桌面关闭偏好在 window_prefs.json，不会被清除。
            </div>
          </div>
        </div>
        <div class="data-row clear-actions">
          <n-button :loading="clearing" secondary size="small" @click="onClearSessions">
            仅清除会话
          </n-button>
          <n-button :disabled="clearing" secondary size="small" @click="onClearApiKeys">
            仅清除 API Key
          </n-button>
          <n-button :loading="clearing" secondary size="small" type="error" @click="onClearAll">
            全部清除
          </n-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./AboutSettings.scss"></style>
