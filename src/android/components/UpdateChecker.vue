<script setup>
import {h, onMounted, ref} from 'vue'
import {NButton, useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@core/stores/settings'
import {isAndroidTauri} from '@core/utils/request'
import {checkAndroidUpdate, downloadAndInstallAndroidUpdate,} from '@core/utils/androidUpdater'

const settings = useSettingsStore()
const dialog = useDialog()
const message = useMessage()
const installing = ref(false)
const checking = ref(false)

function formatBytes(n) {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function showUpdateDialog(result) {
  const baseContent =
    `当前版本 v${result.currentVersion}。是否下载并安装更新？将调起系统安装器完成安装。`
  const d = dialog.info({
    title: `发现新版本 v${result.latest.version}`,
    content: baseContent,
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
                d.content = `${baseContent}\n准备下载…`
                try {
                  await downloadAndInstallAndroidUpdate(result.latest, (info) => {
                    if (info.phase === 'permission') {
                      d.content = `${baseContent}\n检查安装权限…`
                    } else if (info.phase === 'download') {
                      const done = formatBytes(info.downloaded)
                      const total = formatBytes(info.total)
                      const progress = total
                        ? `正在下载 ${done} / ${total}…`
                        : `正在下载 ${done || '…'}…`
                      d.content = `${baseContent}\n${progress}`
                    } else if (info.phase === 'install') {
                      d.content = `${baseContent}\n下载完成，正在调起系统安装器…`
                    }
                  })
                  message.success('已调起系统安装器')
                  installing.value = false
                  d.destroy()
                } catch (e) {
                  installing.value = false
                  d.content = baseContent
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
