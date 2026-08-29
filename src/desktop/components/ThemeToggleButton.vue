<script setup>
import {computed} from 'vue'
import {MoonOutline, SunnyOutline} from '@vicons/ionicons5'
import {useSettingsStore} from '@core/stores/settings'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'

defineProps({
  /** titlebar：标题栏 ctrl 样式；toolbar：圆形图标按钮；drawer：带文案的全宽按钮 */
  variant: {
    type: String,
    default: 'toolbar',
    validator: (v) => ['titlebar', 'toolbar', 'drawer'].includes(v),
  },
})

const settings = useSettingsStore()
const {tooltipTrigger} = useTooltipTrigger()

const icon = computed(() => (settings.theme === 'light' ? MoonOutline : SunnyOutline))
const tip = computed(() => (settings.theme === 'light' ? '切换为深色' : '切换为浅色'))

function onToggle() {
  settings.toggleTheme()
}
</script>

<template>
  <!-- titlebar：与窗口控件同高；外层保证 stretch -->
  <div v-if="variant === 'titlebar'" class="titlebar-wrap">
    <n-tooltip placement="bottom" trigger="hover">
      <template #trigger>
        <button :aria-label="tip" class="ctrl" type="button" @click="onToggle">
          <n-icon :component="icon" :size="14" />
        </button>
      </template>
      {{ tip }}
    </n-tooltip>
  </div>

  <n-tooltip v-else-if="variant === 'toolbar'" :trigger="tooltipTrigger" placement="bottom">
    <template #trigger>
      <n-button
        :aria-label="tip"
        circle
        class="touch-target"
        quaternary
        size="small"
        @click="onToggle"
      >
        <template #icon>
          <n-icon :component="icon" />
        </template>
      </n-button>
    </template>
    {{ tip }}
  </n-tooltip>

  <n-button
    v-else
    :aria-label="tip"
    class="drawer-theme-btn touch-target"
    quaternary
    @click="onToggle"
  >
    <template #icon>
      <n-icon :component="icon" />
    </template>
    {{ tip }}
  </n-button>
</template>

<style lang="scss" scoped>
.titlebar-wrap {
  display: flex;
  align-items: stretch;
  align-self: stretch;
}

.ctrl {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-2);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease;

  &:hover {
    background: var(--border-muted);
    color: var(--text-1);
  }

  &:active {
    background: var(--surface-pressed);
  }

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-primary) 70%, transparent);
    outline-offset: -2px;
  }
}

.drawer-theme-btn {
  width: 100%;
  justify-content: flex-start;
  margin: var(--space-2) 0;
  min-height: var(--touch-min);
}
</style>
