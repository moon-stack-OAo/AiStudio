<script setup>
import {computed, h, ref} from 'vue'
import {NInput, useDialog, useMessage} from 'naive-ui'
import {AddOutline, CreateOutline, TrashOutline,} from '@vicons/ionicons5'

const props = defineProps({
  title: { type: String, default: '会话' },
  sessions: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  /** 嵌入抽屉时铺满宽度 */
  embedded: { type: Boolean, default: false },
})

const emit = defineEmits(['create', 'select', 'rename', 'remove'])

const dialog = useDialog()
const message = useMessage()
const renameValue = ref('')

const options = computed(() =>
  props.sessions.map((s) => ({
    label: s.title || '未命名',
    key: s.id,
  })),
)

function onSelect(key) {
  emit('select', key)
}

function onCreate() {
  emit('create')
}

function onRename() {
  const current = props.sessions.find((s) => s.id === props.activeId)
  if (!current) return
  renameValue.value = current.title || ''
  dialog.create({
    title: '重命名会话',
    content: () =>
      h(NInput, {
        value: renameValue.value,
        'onUpdate:value': (v) => {
          renameValue.value = v
        },
        placeholder: '会话标题',
      }),
    positiveText: '保存',
    negativeText: '取消',
    onPositiveClick: () => {
      const title = renameValue.value.trim()
      if (!title) {
        message.warning('标题不能为空')
        return false
      }
      emit('rename', current.id, title)
    },
  })
}

function onRemove() {
  if (!props.activeId) return
  dialog.warning({
    title: '删除会话',
    content: '确定删除当前会话吗？此操作不可恢复。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => emit('remove', props.activeId),
  })
}
</script>

<template>
  <div :class="{ embedded }" class="session-panel">
    <div class="session-header">
      <div class="session-title">{{ title }}</div>
      <div class="actions">
        <n-button
          aria-label="新建会话"
          circle
          class="touch-target"
          quaternary
          size="small"
          @click="onCreate"
        >
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
        </n-button>
        <n-button
          aria-label="重命名会话"
          circle
          class="touch-target"
          quaternary
          size="small"
          @click="onRename"
        >
          <template #icon>
            <n-icon :component="CreateOutline" />
          </template>
        </n-button>
        <n-button
          aria-label="删除会话"
          circle
          class="touch-target"
          quaternary
          size="small"
          @click="onRemove"
        >
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
        </n-button>
      </div>
    </div>

    <div class="session-list">
      <n-menu
        :options="options"
        :value="activeId"
        @update:value="onSelect"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.session-panel {
  width: var(--sidebar-width);
  flex-shrink: 0;
  border-right: 1px solid var(--border-subtle);
  background: var(--surface-1);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  &.embedded {
    width: 100%;
    border-right: none;
  }
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px 8px;
  flex-shrink: 0;
}

.session-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.actions {
  display: flex;
  gap: 2px;
}

.session-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;

  :deep(.n-menu-item-content) {
    min-height: 40px;
  }
}

@media (max-width: 1279.98px) {
  .session-panel:not(.embedded) {
    width: 180px;
  }
}

@media (max-width: 767.98px) {
  .session-header {
    padding: 12px 10px 8px;
  }

  .session-list {
    :deep(.n-menu-item-content) {
      min-height: var(--touch-min);
      padding-top: 10px;
      padding-bottom: 10px;
    }
  }
}
</style>
