<script setup>
import {ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {MenuOutline} from '@vicons/ionicons5'
import {useSettingsStore} from '@core/stores/settings'
import ThemeToggleButton from '@/components/ThemeToggleButton.vue'

defineProps({
  /** 是否显示顶部栏（非工作区路由的窄屏） */
  showTopbar: {type: Boolean, default: false},
  menuOptions: {type: Array, default: () => []},
  activeKey: {type: String, default: 'chat'},
})

const emit = defineEmits(['menu-update'])

const route = useRoute()
const settings = useSettingsStore()
const mobileNavShow = ref(false)

function open() {
  mobileNavShow.value = true
}

function close() {
  mobileNavShow.value = false
}

function onMenuUpdate(key) {
  emit('menu-update', key)
  close()
}

watch(
  () => route.fullPath,
  () => {
    close()
  },
)

defineExpose({open, close})
</script>

<template>
  <header v-if="showTopbar" class="mobile-topbar">
    <n-button aria-label="打开菜单" circle class="touch-target" quaternary @click="open">
      <template #icon>
        <n-icon :component="MenuOutline" />
      </template>
    </n-button>
    <div class="mobile-title">AI Studio</div>
    <ThemeToggleButton variant="toolbar" />
  </header>

  <n-drawer v-model:show="mobileNavShow" :width="260" placement="left">
    <n-drawer-content closable title="AI Studio">
      <n-menu :options="menuOptions" :value="activeKey" @update:value="onMenuUpdate" />
      <div class="drawer-footer">
        <div v-if="settings.activeProvider" class="provider-chip">
          <span class="dot" />
          <span class="name">{{ settings.activeProvider.name }}</span>
        </div>
        <ThemeToggleButton variant="drawer" />
        <div class="hint">密钥仅保存在本机</div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style lang="scss" scoped>
.mobile-topbar {
  position: relative;
  z-index: var(--z-toolbar);
  flex-shrink: 0;
  min-height: calc(var(--touch-min) + var(--safe-top));
  height: calc(var(--touch-min) + var(--safe-top));
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--safe-top) calc(10px + var(--safe-right)) 0 calc(10px + var(--safe-left));
  border-bottom: 1px solid var(--border-subtle);
  background: var(--color-titlebar);
}

.mobile-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: var(--text-md);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-footer {
  margin-top: var(--space-6);
  padding: var(--space-3) 10px;
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
  padding-bottom: var(--safe-bottom);
}

.provider-chip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 10px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  margin-bottom: var(--space-2);
}

.provider-chip .dot {
  width: var(--space-2);
  height: var(--space-2);
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.55);
  box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 70%, transparent);
}

.provider-chip .name {
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  font-size: var(--text-xs);
  color: var(--text-4);
  padding-left: var(--space-1);
}
</style>
