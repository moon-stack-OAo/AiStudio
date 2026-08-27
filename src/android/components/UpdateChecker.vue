<script setup>
import {onMounted, ref} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {isAndroidTauri} from '@core/utils/request'
import {
  checkAndroidUpdate,
  downloadAndInstallAndroidUpdate,
} from '@core/utils/androidUpdater'

const settings = useSettingsStore()
const dialog = useDialog()
const message = useMessage()
const installing = ref(false)
const checking = ref(false)

function showUpdateDialog(result) {
  const d = dialog.info({
    title: `发现新版本 v${result.latest.version}`,
    content:
      `当前版本 v${result.currentVersion}。是否下载并安装更新？将调起系统安装器完成安装。`,
    positiveText: '下载并安装',
    negativeText: '稍后',
    onPositiveClick: async () => {
      if (installing.value) return false
      installing.value = true
      try {
        await downloadAndInstallAndroidUpdate(result.latest)
        message.success('已调起系统安装器')
      } catch (e) {
        message.error(e?.message || '安装更新失败')
        installing.value = false
        return false
      }
      installing.value = false
    },
    onNegativeClick: () => {
      d.destroy()
    },
  })
}

async function runCheck({silent = false} = {}) {
  if (!isAndroidTauri()) return
  if (checking.value || installing.value) return
  checking.value = true
  try {
    const result = await checkAndroidUpdate()
    if (!result.hasUpdate || !result.latest) {
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
  await runCheck({silent: true})
}

onMounted(() => {
  window.setTimeout(() => {
    autoCheck()
  }, 2200)
})
</script>

<template>
  <span class="update-checker" aria-hidden="true"/>
</template>

<style scoped>
.update-checker {
  display: none;
}
</style>
