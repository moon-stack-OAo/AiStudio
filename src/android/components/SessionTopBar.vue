<script setup>
import {EllipsisHorizontalOutline} from '@vicons/ionicons5'
import SessionHistoryButton from '@/components/SessionHistoryButton.vue'

defineProps({
  title: {type: String, default: ''},
  historyCount: {type: Number, default: 0},
})

const emit = defineEmits(['open-history', 'more'])
</script>

<template>
  <div class="session-topbar app-top">
    <div class="top-side top-side-left">
      <SessionHistoryButton :count="historyCount" @click="emit('open-history')" />
    </div>
    <div class="top-title-block">
      <h1 class="top-title">{{ title }}</h1>
    </div>
    <div class="top-side top-side-right">
      <button aria-label="更多" class="top-more touch-target" type="button" @click="emit('more')">
        <n-icon :component="EllipsisHorizontalOutline" :size="18" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.session-topbar,
.app-top {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0;
}

.top-side {
  width: 72px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.top-side-right {
  justify-content: flex-end;
}

.top-title-block {
  position: absolute;
  left: 72px;
  right: 72px;
  min-width: 0;
  text-align: center;
  pointer-events: none;
}

.top-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top-more {
  appearance: none;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: var(--surface-2);
  }
}

.session-topbar :deep(.history-btn.n-button) {
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 12px;
  border: none;
  background: transparent;
  color: var(--text-2);

  &:active {
    background: var(--surface-2);
  }
}
</style>
