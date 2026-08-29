<script setup>
import {computed, h, onMounted, provide, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {darkTheme, dateZhCN, NIcon, zhCN} from 'naive-ui'
import {ChatbubblesOutline, ImageOutline, SettingsOutline, VideocamOutline} from '@vicons/ionicons5'
import {useSettingsStore} from '@core/stores/settings'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import {useVisualViewport} from '@core/composables/useVisualViewport'
import {isDesktopTauri} from '@core/utils/request'
import {applyDocumentTheme, THEME_OVERRIDES} from '@core/utils/theme'
import TitleBar from '@/components/TitleBar.vue'
import UpdateChecker from '@/components/UpdateChecker.vue'
import CloseConfirm from '@/components/CloseConfirm.vue'
import TrayActionListener from '@/components/TrayActionListener.vue'
import AppMobileChrome from '@/components/AppMobileChrome.vue'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const {isMobile, isCompact} = useBreakpoints()
const desktopFrame = isDesktopTauri()
if (!desktopFrame) useVisualViewport()

const mobileChromeRef = ref(null)
const isWorkspaceRoute = computed(() => {
  const name = String(route.name || '')
  return name === 'chat' || name === 'image' || name === 'video'
})
const showAppMobileTopbar = computed(() => isMobile.value && !isWorkspaceRoute.value)

function openMobileNav() {
  mobileChromeRef.value?.open()
}

provide('openMobileNav', openMobileNav)

const naiveTheme = computed(() => (settings.theme === 'dark' ? darkTheme : null))
const themeOverrides = computed(() => THEME_OVERRIDES[settings.theme] || THEME_OVERRIDES.dark)

function renderIcon(icon) {
  return () => h(NIcon, null, {default: () => h(icon)})
}

const menuOptions = computed(() => {
  const showNew = settings.hasAvailableUpdate
  return [
    {label: '对话', key: 'chat', icon: renderIcon(ChatbubblesOutline)},
    {label: '生图', key: 'image', icon: renderIcon(ImageOutline)},
    {label: '生视频', key: 'video', icon: renderIcon(VideocamOutline)},
    {
      label: () =>
        h('span', {class: 'menu-label-with-badge'}, [
          '设置',
          showNew ? h('span', {class: 'menu-new-badge'}, 'NEW') : null,
        ]),
      key: 'settings',
      icon: () =>
        h('span', {class: 'menu-icon-wrap'}, [
          h(NIcon, null, {default: () => h(SettingsOutline)}),
          showNew ? h('span', {class: 'menu-icon-dot'}) : null,
        ]),
    },
  ]
})

const activeKey = computed(() => String(route.name || 'chat'))
const collapsed = computed(() => isCompact.value && !isMobile.value)

watch(
  () => settings.theme,
  (theme) => applyDocumentTheme(theme),
  {immediate: true},
)

onMounted(() => {
  applyDocumentTheme(settings.theme)
})

function onMenuUpdate(key) {
  router.push(`/${key}`)
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
          <UpdateChecker />
          <TrayActionListener v-if="desktopFrame" />
          <CloseConfirm v-if="desktopFrame" />
          <div
            :class="{
              compact: isCompact,
              mobile: isMobile,
              framed: desktopFrame,
              'has-mobile-topbar': showAppMobileTopbar,
            }"
            class="app-shell"
          >
            <TitleBar v-if="desktopFrame" />

            <div class="app-body">
              <AppMobileChrome
                ref="mobileChromeRef"
                :show-topbar="showAppMobileTopbar"
                :menu-options="menuOptions"
                :active-key="activeKey"
                @menu-update="onMenuUpdate"
              />

              <aside v-if="!isMobile" :class="{collapsed}" class="sidebar">
                <div class="brand">
                  <div class="logo">AI</div>
                  <div v-if="!collapsed" class="brand-text">
                    <div class="title">AI Studio</div>
                    <div class="sub">对话 · 生图 · 生视频</div>
                  </div>
                </div>

                <n-menu
                  :collapsed="collapsed"
                  :collapsed-icon-size="20"
                  :collapsed-width="64"
                  :options="menuOptions"
                  :value="activeKey"
                  @update:value="onMenuUpdate"
                />

                <div v-if="!collapsed" class="sidebar-footer">
                  <div v-if="settings.activeProvider" class="provider-chip">
                    <span class="dot" />
                    <span class="name">{{ settings.activeProvider.name }}</span>
                  </div>
                  <div class="hint">密钥仅保存在本机</div>
                </div>
              </aside>

              <main class="main">
                <router-view v-slot="{Component}">
                  <keep-alive :include="['ChatView', 'ImageView', 'VideoView', 'SettingsView']">
                    <component :is="Component" />
                  </keep-alive>
                </router-view>
              </main>
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
    radial-gradient(900px 500px at 100% 0%, var(--glow-accent), transparent 55%), var(--color-bg);

  &.framed {
    border: 1px solid var(--border-muted);
  }
}

.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  width: 100%;

  .app-shell.mobile & {
    flex-direction: column;
  }
}

.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 18px 12px;
  border-right: 1px solid var(--border-subtle);
  background: var(--color-bg-elevated);
  backdrop-filter: blur(10px);
  transition: width 0.2s ease;

  &.collapsed {
    width: var(--sidebar-collapsed-width);
    padding: 14px 0;
  }
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 10px 18px;
}

.logo {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--on-primary);
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
  flex-shrink: 0;
}

.brand-text .title {
  font-size: 15px;
  font-weight: 600;
}

.brand-text .sub {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}

.sidebar-footer {
  margin-top: auto;
  padding: 12px 10px;
}

.provider-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  margin-bottom: 8px;
}

.provider-chip .dot {
  width: 8px;
  height: 8px;
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
  font-size: 11px;
  color: var(--text-4);
  padding-left: 4px;
}

.main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.app-shell.mobile .main {
  height: 100%;
}

.app-shell.mobile.has-mobile-topbar .main {
  /* 与 AppMobileChrome .mobile-topbar 高度（touch-min + safe-top）对齐 */
  height: calc(100% - var(--touch-min) - var(--safe-top));
}

@media (max-width: 1279.98px) and (min-width: 768px) {
  .sidebar:not(.collapsed) {
    width: var(--sidebar-width-compact);
  }
}
</style>

<style lang="scss">
.menu-label-with-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.menu-new-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 5px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  color: var(--on-primary, #fff);
  background: var(--color-primary);
  flex-shrink: 0;
}

.menu-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.menu-icon-dot {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 0 0 1.5px var(--color-bg-elevated, transparent);
  pointer-events: none;
}

.sidebar:not(.collapsed) .menu-icon-dot {
  display: none;
}
</style>
