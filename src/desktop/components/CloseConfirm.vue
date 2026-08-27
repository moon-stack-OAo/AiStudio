<script setup>
import {onMounted, onUnmounted, ref} from 'vue'
import {listen} from '@tauri-apps/api/event'
import {invoke} from '@tauri-apps/api/core'
import {isDesktopTauri} from '@core/utils/request'

const show = ref(false)
const remember = ref(false)
const submitting = ref(false)
let unlisten = null

async function confirm(action) {
  if (submitting.value) return false
  submitting.value = true
  try {
    await invoke('confirm_close_action', {
      action,
      remember: remember.value,
    })
    show.value = false
    return true
  } catch (e) {
    console.warn('[close] confirm failed', e)
    return false
  } finally {
    submitting.value = false
  }
}

function onCancel() {
  show.value = false
  remember.value = false
}

onMounted(async () => {
  if (!isDesktopTauri()) return
  try {
    unlisten = await listen('ask-close', () => {
      remember.value = false
      show.value = true
    })
  } catch (e) {
    console.warn('[close] listen ask-close failed', e)
  }
})

onUnmounted(() => {
  if (typeof unlisten === 'function') unlisten()
})
</script>

<template>
  <n-modal
    v-model:show="show"
    :close-on-esc="true"
    :loading="submitting"
    :mask-closable="false"
    negative-text="最小化到托盘"
    positive-text="退出程序"
    preset="dialog"
    title="关闭 AI Studio"
    @close="onCancel"
    @esc="onCancel"
    @positive-click="() => confirm('quit')"
    @negative-click="() => confirm('tray')"
  >
    <div class="close-body">
      <p class="desc">请选择关闭窗口后的行为：</p>
      <ul class="tips">
        <li><strong>退出程序</strong>：结束进程并完全退出</li>
        <li><strong>最小化到托盘</strong>：后台继续运行，可从托盘恢复</li>
      </ul>
      <n-checkbox v-model:checked="remember">记住我的选择</n-checkbox>
      <p class="hint">可在「设置 → 关于与更新」中重置为每次询问</p>
    </div>
  </n-modal>
</template>

<style scoped>
.close-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}

.tips {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-3);
}

.hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-4);
}
</style>
