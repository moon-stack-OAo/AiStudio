<script setup>
import {h, onMounted, ref} from 'vue'
import {NButton, useDialog, useMessage} from 'naive-ui'
import {useSettingsStore} from '@/stores/settings'
import {isTauri} from '@/utils/request'
import {checkForUpdate, installUpdateAndRelaunch} from '@/utils/updater'

const settings = useSettingsStore()
const dialog = useDialog()
const message = useMessage()
const installing = ref(false)

async function autoCheck() {
  if (!isTauri() || !settings.autoCheckUpdate) return
  try {
    const result = await checkForUpdate()
    if (!result.hasUpdate || !result.update) return
    if (
      settings.skippedUpdateVersion &&
      settings.skippedUpdateVersion === result.latest.version
    ) {
      return
    }

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
  } catch {
    // 启动静默检查失败不打扰用户
  }
}

onMounted(() => {
  window.setTimeout(() => {
    autoCheck()
  }, 1800)
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
