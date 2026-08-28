<script setup>
import {h, onMounted, onUnmounted} from 'vue'
import {NButton, useDialog} from 'naive-ui'
import {onCheckUpdateRequest} from '@core/utils/trayActions'
import {useSettingsStore} from '@core/stores/settings'
import {useAppUpdater} from '@/composables/useAppUpdater'

const settings = useSettingsStore()
const dialog = useDialog()
const {installing, checkUpdate, installUpdate, skipVersion} = useAppUpdater()
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
                skipVersion(result.latest.version)
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
                await installUpdate(result.update)
                // 成功会 relaunch；失败时 composable 已复位 installing
              },
            },
            {default: () => '下载并安装'},
          ),
        ],
      ),
  })
}

async function runCheck({silent = false} = {}) {
  const result = await checkUpdate({silent})
  if (!result?.hasUpdate || !result.update) return
  // 静默且已跳过：composable 未写入 available，此处也不弹窗
  if (
    silent &&
    settings.skippedUpdateVersion &&
    settings.skippedUpdateVersion === result.latest.version
  ) {
    return
  }
  showUpdateDialog(result)
}

async function autoCheck() {
  if (!settings.autoCheckUpdate) return
  await runCheck({silent: true})
}

function manualCheck() {
  return runCheck({silent: false})
}

defineExpose({manualCheck})

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
