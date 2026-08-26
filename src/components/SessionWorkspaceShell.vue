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
