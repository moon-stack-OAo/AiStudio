<script setup>
import {computed, onMounted, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {clearAppStorage} from '@core/utils/storage'
import {clearImageCache} from '@core/utils/imageCache'
import {isDesktopTauri} from '@core/utils/request'
import {getAppVersion} from '@core/utils/version'
import {CHAT_CONTEXT_MAX_TURNS_OPTIONS} from '@core/utils/constants'
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
            class="select-turns"
            size="small"
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
            <div class="section-desc">清除提供商、对话、生图、生视频等前端缓存</div>
          </div>
        </div>
        <div class="data-row">
          <div class="hint">仅清除浏览器 / WebView 中的本地缓存数据。</div>
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
