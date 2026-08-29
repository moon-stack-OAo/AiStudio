<script setup>
import {computed} from 'vue'
import {ListOutline} from '@vicons/ionicons5'

const props = defineProps({
  count: {type: Number, default: 0},
})

const emit = defineEmits(['click'])

const showBadge = computed(() => props.count > 1)
const badgeValue = computed(() => (props.count > 99 ? '99+' : props.count))

function onClick(e) {
  emit('click', e)
  // 触摸设备点击后主动失焦，避免 :hover/:focus 高亮粘滞
  requestAnimationFrame(() => {
    const el = e?.currentTarget
    if (el && typeof el.blur === 'function') el.blur()
    if (typeof document !== 'undefined' && document.activeElement?.blur) {
      document.activeElement.blur()
    }
  })
}
</script>

<template>
  <n-badge :show="showBadge" :value="badgeValue" class="history-badge" type="info">
    <n-button
      :aria-label="showBadge ? `打开会话列表，共 ${count} 个会话` : '打开会话列表'"
      circle
      class="touch-target history-btn"
      quaternary
      @click="onClick"
    >
      <template #icon>
        <n-icon :component="ListOutline" />
      </template>
    </n-button>
  </n-badge>
</template>

<style lang="scss" scoped>
.history-badge {
  display: inline-flex;
  flex-shrink: 0;

  :deep(.n-badge-sup) {
    font-size: 10px;
    height: 16px;
    min-width: 16px;
    line-height: 16px;
    padding: 0 4px;
    right: 2px;
    top: 2px;
  }
}

.history-btn {
  -webkit-tap-highlight-color: transparent;
}
</style>
