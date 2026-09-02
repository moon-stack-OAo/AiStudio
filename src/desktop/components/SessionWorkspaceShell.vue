<script setup>
import {inject, ref, watch} from 'vue'
import {ListOutline, MenuOutline} from '@vicons/ionicons5'
import SessionList from '@/components/SessionList.vue'

const props = defineProps({
  sessions: {type: Array, default: () => []},
  activeId: {type: String, default: ''},
  historyTitle: {type: String, default: '历史'},
  sessionTitle: {type: String, default: ''},
  isCompact: {type: Boolean, default: false},
  isMobile: {type: Boolean, default: false},
})

const emit = defineEmits(['create', 'select', 'rename', 'remove'])

const historyShow = ref(false)
const openMobileNav = inject('openMobileNav', null)

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
  <div :class="{compact: isCompact, mobile: isMobile}" class="page">
    <n-drawer v-model:show="historyShow" :width="isMobile ? '86%' : 280" placement="left">
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
          <n-button
            v-if="isMobile && openMobileNav"
            aria-label="打开菜单"
            circle
            class="touch-target"
            quaternary
            @click="openMobileNav"
          >
            <template #icon>
              <n-icon :component="MenuOutline" />
            </template>
          </n-button>
          <n-button
            v-if="isCompact"
            aria-label="打开会话列表"
            circle
            class="touch-target"
            quaternary
            size="small"
            @click="historyShow = true"
          >
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
  padding: 12px calc(18px + var(--safe-right)) 12px calc(18px + var(--safe-left));
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
  padding: 10px calc(14px + var(--safe-right)) 10px calc(14px + var(--safe-left));
}

/* 与 useBreakpoints isMobile(<768) 对齐 */
@media (max-width: 767.98px) {
  .toolbar {
    min-height: calc(44px + var(--safe-top));
    padding: var(--safe-top) calc(12px + var(--safe-right)) 6px calc(12px + var(--safe-left));
    flex-wrap: wrap;
    row-gap: 6px;
    column-gap: 6px;
    background: var(--color-titlebar);
  }

  .left {
    width: 100%;
    gap: 6px;
  }

  .right {
    width: 100%;
    gap: 6px;
    flex-wrap: nowrap;
  }

  .session-name {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
    max-width: none;
  }

  .right {
    :deep(.provider-select) {
      display: none;
    }

    :deep(.model-select) {
      flex: 1 1 0;
      width: auto;
      min-width: 0;
    }

    :deep(.toolbar-clear) {
      flex: 0 0 auto;
      min-width: var(--touch-min);
      min-height: var(--touch-min);
      padding: 0 10px;
    }
  }
}
</style>
