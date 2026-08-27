<script setup>
import {onMounted, onUnmounted} from 'vue'
import {useRouter} from 'vue-router'
import {listen} from '@tauri-apps/api/event'
import {isDesktopTauri} from '@core/utils/request'
import {requestCheckUpdate} from '@core/utils/trayActions'

const router = useRouter()
let unlisten = null

onMounted(async () => {
  if (!isDesktopTauri()) return
  try {
    // 托盘动作统一入口，避免分散在多个组件导致卸载后失效
    unlisten = await listen('tray-action', (event) => {
      const action = event?.payload
      if (action === 'open-chat') {
        router.push('/chat')
        return
      }
      if (action === 'open-settings') {
        router.push('/settings')
        return
      }
      if (action === 'check-update') {
        requestCheckUpdate()
      }
    })
  } catch (e) {
    console.warn('[tray] listen tray-action failed', e)
  }
})

onUnmounted(() => {
  if (typeof unlisten === 'function') unlisten()
})
</script>

<template>
  <span class="tray-action-listener" aria-hidden="true" />
</template>

<style scoped>
.tray-action-listener {
  display: none;
}
</style>
