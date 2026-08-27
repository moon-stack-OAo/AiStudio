<script setup>
import {StopOutline} from '@vicons/ionicons5'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'

defineProps({
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  sendIcon: { type: [Object, Function], required: true },
  sendTooltip: { type: String, default: '发送' },
  stopTooltip: { type: String, default: '停止生成' },
})

defineEmits(['send', 'stop'])

const {tooltipTrigger} = useTooltipTrigger()
</script>

<template>
  <n-tooltip v-if="loading" :trigger="tooltipTrigger" placement="top">
    <template #trigger>
      <n-button
        circle
        :aria-label="stopTooltip"
        size="medium"
        type="warning"
        class="action-btn send-btn touch-target"
        @click="$emit('stop')"
      >
        <template #icon>
          <n-icon :component="StopOutline" />
        </template>
      </n-button>
    </template>
    {{ stopTooltip }}
  </n-tooltip>
  <n-tooltip v-else :trigger="tooltipTrigger" placement="top">
    <template #trigger>
      <n-button
        :disabled="disabled"
        circle
        :aria-label="sendTooltip"
        size="medium"
        type="primary"
        class="action-btn send-btn touch-target"
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
