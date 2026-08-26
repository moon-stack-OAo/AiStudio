<script setup>
import {CheckmarkOutline, CopyOutline} from '@vicons/ionicons5'

defineProps({
  active: { type: Boolean, default: false },
  tooltip: { type: String, default: '复制' },
  copiedTooltip: { type: String, default: '已复制' },
})

defineEmits(['click'])
</script>

<template>
  <n-tooltip placement="bottom" trigger="hover">
    <template #trigger>
      <n-button circle quaternary size="tiny" @click="$emit('click')">
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
