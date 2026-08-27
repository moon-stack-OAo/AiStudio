<script setup>
import {CheckmarkOutline, CopyOutline} from '@vicons/ionicons5'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'

defineProps({
  active: { type: Boolean, default: false },
  tooltip: { type: String, default: '复制' },
  copiedTooltip: { type: String, default: '已复制' },
})

defineEmits(['click'])

const {tooltipTrigger} = useTooltipTrigger()
</script>

<template>
  <n-tooltip :trigger="tooltipTrigger" placement="bottom">
    <template #trigger>
      <n-button
        :aria-label="active ? copiedTooltip : tooltip"
        circle
        class="touch-target"
        quaternary
        size="tiny"
        @click="$emit('click')"
      >
        <template #icon>
          <n-icon
            :component="active ? CheckmarkOutline : CopyOutline"
            :size="14"
          />
        </template>
      </n-button>
    </template>
    {{ active ? copiedTooltip : tooltip }}
  </n-tooltip>
</template>
