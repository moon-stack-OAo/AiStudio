<script setup>
import {h, onMounted, onUnmounted, ref} from 'vue'
import {NButton, useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@/stores/settings'
import {isDesktopTauri} from '@/utils/request'
import {checkForUpdate, installUpdateAndRelaunch} from '@/utils/updater'
import {onCheckUpdateRequest} from '@/utils/trayActions'

const settings = useSettingsStore()
const dialog = useDialog()
const message = useMessage()
const installing = ref(false)
const checking = ref(false)
let unlistenCheckUpdate = null

function showUpdateDialog(result) {
  const d = dialog.info({
    title: `发现新版本 v${result.latest.version}`,
    content: `当前版本 v${result.currentVersion}。是否下载并安装更新？安装完成后将自动重启。`,
    closable: true,
    maskClosable: true,
    action: () =>
      h(
        'div',
        {style: 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap'},
        [
          h(
            NButton,
            {
              size: 'small',
              disabled: installing.value,
              onClick: () => {
                settings.skipUpdateVersion(result.latest.version)
                message.info(`已跳过 v${result.latest.version}`)
                d.destroy()
              },
            },
            {default: () => '跳过此版本'},
          ),
          h(
            NButton,
            {
              size: 'small',
              disabled: installing.value,
              onClick: () => d.destroy(),
            },
            {default: () => '稍后'},
          ),
          h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              loading: installing.value,
              onClick: async () => {
                if (installing.value) return
                installing.value = true
                try {
                  await installUpdateAndRelaunch(result.update)
                } catch (e) {
                  installing.value = false
                  message.error(e?.message || '安装更新失败')
                }
              },
            },
            {default: () => '下载并安装'},
          ),
        ],
      ),
  })
}

async function runCheck({ silent = false } = {}) {
  if (!isDesktopTauri()) {
    if (!silent) message.info('应用内更新仅支持桌面客户端')
    return
  }
  if (checking.value || installing.value) return
  checking.value = true
  try {
    const result = await checkForUpdate()
    if (!result.hasUpdate || !result.update) {
      settings.clearAvailableUpdate()
      if (!silent) message.info('当前已是最新版本')
      return
    }
    if (
      silent &&
      settings.skippedUpdateVersion &&
      settings.skippedUpdateVersion === result.latest.version
    ) {
      return
    }
    if (!silent) settings.clearSkippedUpdateVersion()
    settings.setAvailableUpdate(result.latest.version)
    showUpdateDialog(result)
  } catch (e) {
    if (!silent) message.error(e?.message || '检查更新失败')
  } finally {
    checking.value = false
  }
}

async function autoCheck() {
  if (!settings.autoCheckUpdate) return
  await runCheck({ silent: true })
}

function manualCheck() {
  return runCheck({ silent: false })
}

defineExpose({ manualCheck })

onMounted(() => {
  window.setTimeout(() => {
    autoCheck()
  }, 1800)
  // 托盘「检查更新」由 TrayActionListener 统一接收后转发至此
  unlistenCheckUpdate = onCheckUpdateRequest(() => {
    manualCheck()
  })
})

onUnmounted(() => {
  if (typeof unlistenCheckUpdate === 'function') unlistenCheckUpdate()
})
</script>

<template>
  <span class="update-checker" aria-hidden="true" />
</template>

<style scoped>
.update-checker {
  display: none;
}
</style>
