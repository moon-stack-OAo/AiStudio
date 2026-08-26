<script setup>
import {computed, onMounted, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@/stores/settings'
import {clearAppStorage} from '@/utils/storage'
import {clearImageCache} from '@/utils/imageCache'
import {isTauri} from '@/utils/request'
import {getAppVersion} from '@/utils/version'
import {checkForUpdate, installUpdateAndRelaunch} from '@/utils/updater'
import {CHAT_CONTEXT_MAX_TURNS_OPTIONS} from '@/utils/constants'
import {renderSelectLabel} from '@/utils/selectRender'

const settings = useSettingsStore()
const message = useMessage()
const dialog = useDialog()
const inTauri = isTauri()

const appVersion = ref('…')
const checkingUpdate = ref(false)
const installingUpdate = ref(false)
const clearing = ref(false)
const updateProgress = ref('')
const updateResult = ref(null)
const pendingUpdate = ref(null)
const closePref = ref('ask')
const savingClosePref = ref(false)

const closePrefOptions = [
  { label: '每次询问', value: 'ask' },
  { label: '直接退出', value: 'quit' },
  { label: '最小化到托盘', value: 'tray' },
]

const maxTurnsOptions = computed(() =>
  CHAT_CONTEXT_MAX_TURNS_OPTIONS.map((n) => ({
    label: `${n} 轮`,
    value: n,
  })),
)

onMounted(async () => {
  appVersion.value = await getAppVersion()
  if (inTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
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
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_close_action_pref', { action: value })
    closePref.value = value
    message.success('已更新关闭行为')
  } catch (e) {
    message.error(e?.message || '保存失败')
  } finally {
    savingClosePref.value = false
  }
}

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

function onClearLocalData() {
  if (clearing.value) return
  dialog.warning({
    title: '清除本地数据',
    content:
      '将清除本机保存的提供商配置、对话与生图记录（含 API Key 与图片缓存）。清除后页面会刷新。',
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
              size="small"
              @update:value="(v) => settings.setChatContextTrimEnabled(v)"
            />
            <span class="field-label tight">自动裁剪上下文</span>
          </div>
          <n-select
            :disabled="!settings.chatContextTrimEnabled"
            :options="maxTurnsOptions"
            :render-label="renderSelectLabel"
            :value="settings.chatContextMaxTurns"
            size="small"
            style="width: 120px"
            @update:value="(v) => settings.setChatContextMaxTurns(v)"
          />
        </div>
        <div class="hint context-extra-hint">
          1 轮 = 一次用户提问及其后回复；接近上限时对话页会提示
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
            size="small"
            style="width: 200px"
            @update:value="onClosePrefChange"
          />
          <div class="hint">选择「每次询问」后，关闭时会再次弹出提示</div>
        </div>
      </div>

      <div class="section-card data-card">
        <div class="section-head">
          <div>
            <div class="section-title">本地数据</div>
            <div class="section-desc">清除提供商、对话、生图等前端缓存</div>
          </div>
        </div>
        <div class="data-row">
          <div class="hint">
            仅清除浏览器 / WebView 中的本地缓存数据。
          </div>
          <n-button
            :loading="clearing"
            secondary
            size="small"
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
