<script setup>
import {h, ref} from 'vue'
import {NInput, useDialog, useMessage} from 'naive-ui'
import {AddOutline, EllipsisHorizontalOutline} from '@vicons/ionicons5'

const props = defineProps({
  title: {type: String, default: '会话'},
  sessions: {type: Array, default: () => []},
  activeId: {type: String, default: ''},
  /** 嵌入抽屉时铺满宽度 */
  embedded: {type: Boolean, default: false},
})

const emit = defineEmits(['create', 'select', 'rename', 'remove'])

const dialog = useDialog()
const message = useMessage()
const renameValue = ref('')

const rowActionOptions = [
  {label: '重命名', key: 'rename'},
  {label: '删除', key: 'remove'},
]

function onSelect(id) {
  if (id === props.activeId) return
  emit('select', id)
}

function onCreate() {
  emit('create')
}

function onRowAction(action, id) {
  if (action === 'rename') onRename(id)
  else if (action === 'remove') onRemove(id)
}

function onRename(id) {
  const session = props.sessions.find((s) => s.id === id)
  if (!session) return
  renameValue.value = session.title || ''
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
      emit('rename', session.id, title)
    },
  })
}

function onRemove(id) {
  if (!id) return
  const session = props.sessions.find((s) => s.id === id)
  const name = session?.title || '未命名'
  dialog.warning({
    title: '删除会话',
    content: `确定删除「${name}」吗？此操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => emit('remove', id),
  })
}
</script>

<template>
  <div :class="{embedded}" class="session-panel">
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
      </div>
    </div>

    <div class="session-list" role="menu">
      <div
        v-for="s in sessions"
        :key="s.id"
        :aria-current="s.id === activeId ? 'true' : undefined"
        :class="{active: s.id === activeId}"
        class="session-item"
        role="menuitem"
        tabindex="0"
        @click="onSelect(s.id)"
        @keydown.enter.prevent="onSelect(s.id)"
      >
        <span class="session-item-title">{{ s.title || '未命名' }}</span>
        <n-dropdown
          :options="rowActionOptions"
          placement="bottom-end"
          trigger="click"
          @select="(key) => onRowAction(key, s.id)"
        >
          <n-button
            aria-label="会话操作"
            circle
            class="session-row-more touch-target"
            quaternary
            size="tiny"
            @click.stop
          >
            <template #icon>
              <n-icon :component="EllipsisHorizontalOutline" :size="16" />
            </template>
          </n-button>
        </n-dropdown>
      </div>
      <div v-if="!sessions.length" class="session-empty">暂无会话</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.session-panel {
  width: var(--session-list-width);
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
  padding: 14px var(--space-3) var(--space-2);
  flex-shrink: 0;
}

.session-title {
  font-size: var(--text-sm);
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
  padding: var(--space-1) var(--space-2) var(--space-3);
}

.session-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  min-height: 40px;
  padding: 0 var(--space-2) 0 var(--space-3);
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-2);
  user-select: none;

  &:hover {
    background: var(--surface-2);
  }

  &.active {
    background: var(--primary-soft);
    color: var(--color-primary);
    font-weight: 500;
  }

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }
}

.session-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.4;
}

.session-row-more {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.session-item:hover .session-row-more,
.session-item.active .session-row-more,
.session-item:focus-within .session-row-more {
  opacity: 1;
}

.session-panel.embedded .session-row-more {
  opacity: 1;
}

.session-empty {
  padding: var(--space-4) var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-3);
  text-align: center;
}

@media (max-width: 1279.98px) {
  .session-panel:not(.embedded) {
    width: var(--session-list-width-compact);
  }
}

@media (max-width: 767.98px) {
  .session-header {
    padding: var(--space-3) 10px var(--space-2);
  }

  .session-item {
    min-height: var(--touch-min);
  }

  .session-row-more {
    opacity: 1;
  }
}
</style>
