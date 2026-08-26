<script setup>
import {StopOutline} from '@vicons/ionicons5'

defineProps({
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  sendIcon: { type: [Object, Function], required: true },
  sendTooltip: { type: String, default: '发送' },
  stopTooltip: { type: String, default: '停止生成' },
})

defineEmits(['send', 'stop'])
</script>

<template>
  <n-tooltip v-if="loading" placement="top" trigger="hover">
    <template #trigger>
      <n-button
        circle
        class="action-btn send-btn"
        size="medium"
        type="warning"
        @click="$emit('stop')"
      >
        <template #icon>
          <n-icon :component="StopOutline" />
        </template>
      </n-button>
    </template>
    {{ stopTooltip }}
  </n-tooltip>
  <n-tooltip v-else placement="top" trigger="hover">
    <template #trigger>
      <n-button
        :disabled="disabled"
        circle
        class="action-btn send-btn"
        size="medium"
        type="primary"
        @click="$emit('send')"
      >
        <template #icon>
          <n-icon :component="sendIcon" />
        </template>
      </n-button>
    </template>
    {{ sendTooltip }}
  </n-tooltip>
</template>
