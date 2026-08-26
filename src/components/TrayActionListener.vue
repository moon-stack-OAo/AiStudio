<script setup>
import {onMounted, onUnmounted} from 'vue'
import {useRouter} from 'vue-router'
import {listen} from '@tauri-apps/api/event'
import {isDesktopTauri} from '@/utils/request'

const router = useRouter()
let unlisten = null

onMounted(async () => {
  if (!isDesktopTauri()) return
  try {
    unlisten = await listen('tray-action', (event) => {
      const action = event?.payload
      if (action === 'open-chat') {
        router.push('/chat')
        return
      }
      if (action === 'open-settings') {
        router.push('/settings')
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
