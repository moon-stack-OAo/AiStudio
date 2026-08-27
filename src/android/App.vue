<script setup>
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {darkTheme, dateZhCN, NIcon, zhCN} from 'naive-ui'
import {ChatbubblesOutline, ImageOutline, SettingsOutline, VideocamOutline,} from '@vicons/ionicons5'
import {useSettingsStore} from '@core/stores/settings'
import {KEYBOARD_OPEN_DELTA_PX, useVisualViewport} from '@core/composables/useVisualViewport'
import {applyDocumentTheme, THEME_OVERRIDES} from '@core/utils/theme'
import UpdateChecker from '@/components/UpdateChecker.vue'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
useVisualViewport()

const keyboardOpen = ref(false)
let baselineHeight = 0

const naiveTheme = computed(() => (settings.theme === 'dark' ? darkTheme : null))
const themeOverrides = computed(() => THEME_OVERRIDES[settings.theme] || THEME_OVERRIDES.dark)

const tabs = [
  {key: 'chat', label: '对话', icon: ChatbubblesOutline, path: '/chat'},
  {key: 'image', label: '生图', icon: ImageOutline, path: '/image'},
  {key: 'video', label: '生视频', icon: VideocamOutline, path: '/video'},
  {key: 'settings', label: '设置', icon: SettingsOutline, path: '/settings'},
]

const activeKey = computed(() => String(route.name || 'chat'))

watch(
  () => settings.theme,
  (theme) => applyDocumentTheme(theme),
  {immediate: true},
)

function syncKeyboard() {
  const vv = window.visualViewport
  const height = vv?.height ?? window.innerHeight
  if (!baselineHeight || height > baselineHeight) {
    baselineHeight = height
  }
  // 可视高度明显缩小视为软键盘弹起，收起底栏避免挡输入
  keyboardOpen.value = baselineHeight - height > KEYBOARD_OPEN_DELTA_PX
}

onMounted(() => {
  applyDocumentTheme(settings.theme)
  syncKeyboard()
  const vv = window.visualViewport
  if (vv) {
    vv.addEventListener('resize', syncKeyboard)
    vv.addEventListener('scroll', syncKeyboard)
  }
  window.addEventListener('resize', syncKeyboard)
})

onBeforeUnmount(() => {
  const vv = window.visualViewport
  if (vv) {
    vv.removeEventListener('resize', syncKeyboard)
    vv.removeEventListener('scroll', syncKeyboard)
  }
  window.removeEventListener('resize', syncKeyboard)
})

function goTab(tab) {
  if (route.path !== tab.path) router.push(tab.path)
}
</script>

<template>
  <n-config-provider
    :date-locale="dateZhCN"
    :locale="zhCN"
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
  >
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <UpdateChecker/>
          <div :class="{ 'keyboard-open': keyboardOpen }" class="app-shell mobile">
            <div class="app-body">
              <main class="main">
                <router-view/>
              </main>

              <nav aria-label="主导航" class="tab-bar">
                <button
                  v-for="tab in tabs"
                  :key="tab.key"
                  :class="{ active: activeKey === tab.key }"
                  class="tab-item"
                  type="button"
                  @click="goTab(tab)"
                >
                  <n-icon :component="tab.icon" :size="22" class="tab-icon"/>
                  <span class="tab-label">{{ tab.label }}</span>
                </button>
              </nav>
            </div>
          </div>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style lang="scss" scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(1200px 600px at 10% -10%, var(--glow-primary), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, var(--glow-accent), transparent 55%),
    var(--color-bg);
}

.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.tab-bar {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
  gap: 4px;
  min-height: calc(52px + var(--safe-bottom));
  padding: 4px calc(8px + var(--safe-right)) calc(4px + var(--safe-bottom)) calc(8px + var(--safe-left));
  border-top: 1px solid var(--border-subtle);
  background: var(--color-titlebar);
  transition: transform 0.18s ease, opacity 0.18s ease, max-height 0.18s ease, padding 0.18s ease, min-height 0.18s ease;
  max-height: 120px;
  overflow: hidden;
}

.tab-item {
  flex: 1;
  min-width: 0;
  min-height: var(--touch-min);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px 6px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &.active {
    color: var(--color-primary);
  }

  &:active {
    background: var(--surface-2);
  }
}

.tab-icon {
  display: block;
}

.tab-label {
  font-size: 11px;
  line-height: 1.2;
  font-weight: 500;
}

.keyboard-open .tab-bar {
  max-height: 0;
  min-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
  pointer-events: none;
  border-top-width: 0;
}
</style>
