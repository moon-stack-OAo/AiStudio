<script setup>
import {StopOutline} from '@vicons/ionicons5'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'

defineProps({
  loading: {type: Boolean, default: false},
  disabled: {type: Boolean, default: false},
  sendIcon: {type: [Object, Function], required: true},
  sendTooltip: {type: String, default: '发送'},
  stopTooltip: {type: String, default: '停止生成'},
  /** desktop 显示 n-tooltip；android 仅 aria-label */
  withTooltip: {type: Boolean, default: false},
})

defineEmits(['send', 'stop'])

const {tooltipTrigger} = useTooltipTrigger()
</script>

<template>
  <template v-if="withTooltip">
    <n-tooltip v-if="loading" :trigger="tooltipTrigger" placement="top">
      <template #trigger>
        <n-button
          :aria-label="stopTooltip"
          circle
          class="action-btn send-btn touch-target"
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
    <n-tooltip v-else :trigger="tooltipTrigger" placement="top">
      <template #trigger>
        <n-button
          :aria-label="sendTooltip"
          :disabled="disabled"
          circle
          class="action-btn send-btn touch-target"
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
  <template v-else>
    <n-button
      v-if="loading"
      :aria-label="stopTooltip"
      circle
      class="action-btn send-btn touch-target"
      size="medium"
      type="warning"
      @click="$emit('stop')"
    >
      <template #icon>
        <n-icon :component="StopOutline" />
      </template>
    </n-button>
    <n-button
      v-else
      :aria-label="sendTooltip"
      :disabled="disabled"
      circle
      class="action-btn send-btn touch-target"
      size="medium"
      type="primary"
      @click="$emit('send')"
    >
      <template #icon>
        <n-icon :component="sendIcon" />
      </template>
    </n-button>
  </template>
</template>
