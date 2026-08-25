<script setup>
import {computed, h} from 'vue'
import {useDialog, useMessage} from 'naive-ui'
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
  dialog.create({
    title: '重命名会话',
    content: () =>
      h('div', { style: 'margin-top: 8px' }, [
        h('input', {
          id: 'rename-input',
          value: current.title,
          style:
            'width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:#1a1d24;color:#fff;outline:none;',
        }),
      ]),
    positiveText: '保存',
    negativeText: '取消',
    onPositiveClick: () => {
      const el = document.getElementById('rename-input')
      const title = el?.value?.trim()
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
        <n-button circle quaternary size="small" @click="onCreate">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
        </n-button>
        <n-button circle quaternary size="small" @click="onRename">
          <template #icon>
            <n-icon :component="CreateOutline" />
          </template>
        </n-button>
        <n-button circle quaternary size="small" @click="onRemove">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
        </n-button>
      </div>
    </div>

    <n-menu
      :options="options"
      :value="activeId"
      @update:value="onSelect"
    />
  </div>
</template>

<style lang="scss" scoped>
.session-panel {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;

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
}

.session-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.75);
}

.actions {
  display: flex;
  gap: 2px;
}

@media (max-width: 1279.98px) {
  .session-panel:not(.embedded) {
    width: 180px;
  }
}
</style>
