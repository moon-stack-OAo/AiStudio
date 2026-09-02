<script setup>
import {ref, watch} from 'vue'
import SessionList from '@/components/SessionList.vue'
import {useBackCloseLayer} from '@/composables/useBackCloseLayer'

const props = defineProps({
  sessions: {type: Array, default: () => []},
  activeId: {type: String, default: ''},
  historyTitle: {type: String, default: '历史'},
})

const emit = defineEmits(['create', 'select', 'rename', 'remove'])

const historyShow = ref(false)
useBackCloseLayer(historyShow)

watch(
  () => props.activeId,
  () => {
    historyShow.value = false
  },
)

function openHistory() {
  historyShow.value = true
}

function onCreate() {
  emit('create')
  historyShow.value = false
}

function onSelect(id) {
  emit('select', id)
  historyShow.value = false
}

defineExpose({openHistory})
</script>

<template>
  <div class="page">
    <n-drawer v-model:show="historyShow" class="history-drawer" placement="left" width="86%">
      <n-drawer-content :title="historyTitle" closable>
        <SessionList
          :active-id="activeId"
          :sessions="sessions"
          :title="historyTitle"
          embedded
          @create="onCreate"
          @remove="(id) => emit('remove', id)"
          @rename="(id, title) => emit('rename', id, title)"
          @select="onSelect"
        />
      </n-drawer-content>
    </n-drawer>

    <div class="workspace-main">
      <div class="page-toolbar">
        <slot :open-history="openHistory" name="toolbar" />
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
  min-height: 0;
}

.workspace-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.page-toolbar {
  flex-shrink: 0;
  min-height: calc(44px + var(--safe-top));
  display: flex;
  align-items: center;
  padding: var(--safe-top) calc(14px + var(--safe-right)) 8px calc(14px + var(--safe-left));
  border-bottom: 0;
  background: var(--color-bg, var(--color-titlebar));
}
</style>

<style lang="scss">
.history-drawer.n-drawer .n-drawer-content {
  padding-top: var(--safe-top);
  padding-left: var(--safe-left);
}
</style>
