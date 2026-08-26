<script setup>
import {ref, watch} from 'vue'
import {ListOutline} from '@vicons/ionicons5'
import SessionList from '@/components/SessionList.vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  historyTitle: { type: String, default: '历史' },
  sessionTitle: { type: String, default: '' },
  isCompact: { type: Boolean, default: false },
  isMobile: { type: Boolean, default: false },
})

const emit = defineEmits(['create', 'select', 'rename', 'remove'])

const historyShow = ref(false)

watch(
  () => props.activeId,
  () => {
    historyShow.value = false
  },
)

function onCreate() {
  emit('create')
  historyShow.value = false
}

function onSelect(id) {
  emit('select', id)
  historyShow.value = false
}
</script>

<template>
  <div :class="{ compact: isCompact, mobile: isMobile }" class="page">
    <SessionList
      v-if="!isCompact"
      :active-id="activeId"
      :sessions="sessions"
      :title="historyTitle"
      @create="emit('create')"
      @remove="(id) => emit('remove', id)"
      @rename="(id, title) => emit('rename', id, title)"
      @select="(id) => emit('select', id)"
    />

    <n-drawer
      v-model:show="historyShow"
      :width="isMobile ? '86%' : 280"
      display-directive="show"
      placement="left"
    >
      <n-drawer-content closable :title="historyTitle">
        <SessionList
          :active-id="activeId"
          :sessions="sessions"
          embedded
          :title="historyTitle"
          @create="onCreate"
          @remove="(id) => emit('remove', id)"
          @rename="(id, title) => emit('rename', id, title)"
          @select="onSelect"
        />
      </n-drawer-content>
    </n-drawer>

    <div class="workspace-main">
      <div class="toolbar">
        <div class="left">
          <n-button v-if="isCompact" circle quaternary size="small" @click="historyShow = true">
            <template #icon>
              <n-icon :component="ListOutline" />
            </template>
          </n-button>
          <div class="session-name">{{ sessionTitle }}</div>
        </div>
        <div class="right">
          <slot name="toolbar-right" />
        </div>
      </div>

      <slot />

      <slot name="composer" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page {
  display: flex;
  height: 100%;
}

.workspace-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.left,
.right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.session-name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page.compact .toolbar {
  padding: 10px 14px;
}

@media (max-width: 767.98px) {
  .toolbar {
    padding: 10px 12px;
    flex-wrap: wrap;
  }

  .right {
    width: 100%;
    flex-wrap: wrap;

    :deep(.provider-select) {
      flex: 1;
      width: auto;
      min-width: 120px;
    }

    :deep(.model-select) {
      flex: 1;
      width: auto;
      min-width: 140px;
    }
  }
}
</style>
