<script setup>
import {computed, h, onBeforeUnmount, onMounted, provide, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {darkTheme, dateZhCN, NIcon, zhCN} from 'naive-ui'
import {ChatbubblesOutline, ImageOutline, SettingsOutline, VideocamOutline} from '@vicons/ionicons5'
import {useSettingsStore} from '@core/stores/settings'
import {useChatStore} from '@core/stores/chat'
import {useImageStore} from '@core/stores/image'
import {useVideoStore} from '@core/stores/video'
import {chatGeneration, imageGeneration, videoGeneration} from '@core/runtime/generationRuntime'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import {useVisualViewport} from '@core/composables/useVisualViewport'
import {isDesktopTauri} from '@core/utils/request'
import {
  applyDocumentTheme,
  applyDocumentUiPrefs,
  THEME_OVERRIDES,
  watchSystemTheme,
} from '@core/utils/theme'
import TitleBar from '@/components/TitleBar.vue'
import UpdateChecker from '@/components/UpdateChecker.vue'
import CloseConfirm from '@/components/CloseConfirm.vue'
import TrayActionListener from '@/components/TrayActionListener.vue'
import AppMobileChrome from '@/components/AppMobileChrome.vue'
import SessionList from '@/components/SessionList.vue'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const chatStore = useChatStore()
const imageStore = useImageStore()
const videoStore = useVideoStore()
const {isMobile, isCompact} = useBreakpoints()
const desktopFrame = isDesktopTauri()
if (!desktopFrame) useVisualViewport()

const mobileChromeRef = ref(null)
let stopWatchSystem = null
const isWorkspaceRoute = computed(() => {
  const name = String(route.name || '')
  return name === 'chat' || name === 'image' || name === 'video'
})
const showAppMobileTopbar = computed(() => isMobile.value && !isWorkspaceRoute.value)
const showSidebarSessions = computed(() => !isMobile.value && isWorkspaceRoute.value)
/** 桌面窄屏（<1024）自动收成图标轨；移动端隐藏侧栏走 AppMobileChrome */
const collapsed = computed(() => isCompact.value && !isMobile.value)

function openMobileNav() {
  mobileChromeRef.value?.open()
}

provide('openMobileNav', openMobileNav)

const resolvedTheme = computed(() => settings.resolvedTheme)
const naiveTheme = computed(() => (resolvedTheme.value === 'dark' ? darkTheme : null))
const themeOverrides = computed(() => THEME_OVERRIDES[resolvedTheme.value] || THEME_OVERRIDES.dark)
const brandMark = computed(() => (resolvedTheme.value === 'light' ? 'B' : 'A'))

function syncSystemThemeWatch() {
  if (stopWatchSystem) {
    stopWatchSystem()
    stopWatchSystem = null
  }
  if (settings.theme !== 'system') return
  settings.syncSystemTheme()
  stopWatchSystem = watchSystemTheme((t) => {
    settings.syncSystemTheme(t)
  })
}

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
const sidebarSessions = computed(() => {
  if (activeKey.value === 'image') return imageStore.sortedSessions
  if (activeKey.value === 'video') return videoStore.sortedSessions
  return chatStore.sortedSessions
})

const sidebarActiveId = computed(() => {
  if (activeKey.value === 'image') return imageStore.activeId
  if (activeKey.value === 'video') return videoStore.activeId
  return chatStore.activeId
})

const newSessionLabel = computed(() => {
  if (activeKey.value === 'image') return '＋ 新建生图'
  if (activeKey.value === 'video') return '＋ 新建视频'
  return '＋ 新建对话'
})

const userFootName = computed(() => settings.activeProvider?.name || '本地工作区')
const userFootMeta = computed(() => (settings.activeProvider ? '密钥仅保存在本机' : '未配置提供商'))
const userFootAvatar = computed(() => {
  const name = String(userFootName.value || '本').trim()
  return name.slice(0, 1).toUpperCase() || '本'
})

watch(resolvedTheme, (theme) => applyDocumentTheme(theme), {immediate: true})

watch(
  () => settings.theme,
  () => syncSystemThemeWatch(),
  {immediate: true},
)

watch(
  () => [settings.uiFontScale, settings.uiDensity],
  ([fontScale, density]) => applyDocumentUiPrefs({fontScale, density}),
  {immediate: true},
)

onMounted(() => {
  applyDocumentTheme(resolvedTheme.value)
  applyDocumentUiPrefs({fontScale: settings.uiFontScale, density: settings.uiDensity})
  syncSystemThemeWatch()
})

onBeforeUnmount(() => {
  if (stopWatchSystem) {
    stopWatchSystem()
    stopWatchSystem = null
  }
})

function onMenuUpdate(key) {
  router.push(`/${key}`)
}

function ensureWorkspaceRoute(kind) {
  if (activeKey.value === kind) return
  router.push(`/${kind}`)
}

function onCreateSession() {
  const kind = activeKey.value
  if (kind === 'image') {
    imageStore.createSession()
    ensureWorkspaceRoute('image')
    return
  }
  if (kind === 'video') {
    videoStore.createSession()
    ensureWorkspaceRoute('video')
    return
  }
  chatStore.createSession()
  ensureWorkspaceRoute('chat')
}

function onSelectSession(id) {
  const kind = activeKey.value
  if (kind === 'image') {
    imageStore.setActive(id)
    return
  }
  if (kind === 'video') {
    videoStore.setActive(id)
    return
  }
  chatStore.setActive(id)
}

function onRenameSession(id, title) {
  const kind = activeKey.value
  if (kind === 'image') {
    imageStore.renameSession(id, title)
    return
  }
  if (kind === 'video') {
    videoStore.renameSession(id, title)
    return
  }
  chatStore.renameSession(id, title)
}

function onRemoveSession(id) {
  const kind = activeKey.value
  if (kind === 'image') {
    imageGeneration.abortIfSession(id)
    imageStore.removeSession(id)
    return
  }
  if (kind === 'video') {
    videoGeneration.abortIfSession(id)
    videoStore.removeSession(id)
    return
  }
  chatGeneration.abortIfSession(id)
  chatStore.removeSession(id)
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
                  <div class="logo">{{ brandMark }}</div>
                  <div v-if="!collapsed" class="brand-text">
                    <div class="title">AI Studio</div>
                    <div class="sub">本地 · 多模态</div>
                  </div>
                </div>

                <n-button
                  v-if="!collapsed"
                  class="new-session-btn"
                  type="primary"
                  @click="onCreateSession"
                >
                  {{ newSessionLabel }}
                </n-button>
                <n-button
                  v-else
                  aria-label="新建会话"
                  circle
                  class="new-session-btn-collapsed"
                  type="primary"
                  @click="onCreateSession"
                >
                  ＋
                </n-button>

                <n-menu
                  :collapsed="collapsed"
                  :collapsed-icon-size="20"
                  :collapsed-width="64"
                  :options="menuOptions"
                  :value="activeKey"
                  @update:value="onMenuUpdate"
                />

                <div v-if="!collapsed && showSidebarSessions" class="sidebar-sessions">
                  <SessionList
                    :active-id="sidebarActiveId"
                    :sessions="sidebarSessions"
                    variant="sidebar"
                    @create="onCreateSession"
                    @remove="onRemoveSession"
                    @rename="onRenameSession"
                    @select="onSelectSession"
                  />
                </div>

                <div v-if="!collapsed" class="sidebar-footer">
                  <div class="user-foot">
                    <div class="avatar">{{ userFootAvatar }}</div>
                    <div class="user-meta">
                      <strong>{{ userFootName }}</strong>
                      <span>{{ userFootMeta }}</span>
                    </div>
                  </div>
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
  background: var(--color-bg);

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
  min-width: var(--sidebar-width);
  max-width: var(--sidebar-width);
  flex: 0 0 var(--sidebar-width);
  display: flex;
  flex-direction: column;
  padding: 14px 10px 12px;
  border-right: 1px solid var(--border-subtle);
  background: var(--sidebar-bg, var(--color-bg-elevated));
  transition:
    width var(--motion-base, 0.2s) var(--ease-standard, ease),
    min-width var(--motion-base, 0.2s) var(--ease-standard, ease),
    max-width var(--motion-base, 0.2s) var(--ease-standard, ease),
    flex-basis var(--motion-base, 0.2s) var(--ease-standard, ease);
  min-height: 0;
  box-sizing: border-box;

  &.collapsed {
    width: var(--sidebar-collapsed-width);
    min-width: var(--sidebar-collapsed-width);
    max-width: var(--sidebar-collapsed-width);
    flex: 0 0 var(--sidebar-collapsed-width);
    padding: 14px 0;
    align-items: center;
  }
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 4px 8px 12px;
  flex-shrink: 0;

  .sidebar.collapsed & {
    padding: 4px 0 12px;
    justify-content: center;
  }
}

.logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 13px;
  color: var(--on-primary);
  background: var(--color-primary);
  flex-shrink: 0;
}

.brand-text .title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
}

.brand-text .sub {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
  line-height: 1.2;
}

.new-session-btn {
  flex: 0 0 auto;
  align-self: stretch;
  width: auto;
  max-width: none;
  margin: 0 4px 10px;
  height: 36px;
  font-weight: 600;
  box-sizing: border-box;
}

.new-session-btn-collapsed {
  flex: 0 0 auto;
  width: 36px;
  min-width: 36px;
  max-width: 36px;
  margin-bottom: 10px;
  font-weight: 700;
}

.sidebar-sessions {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 4px;
  border-top: 1px solid var(--border-subtle);
  overflow: hidden;
}

.sidebar-footer {
  margin-top: auto;
  padding: 10px 4px 2px;
  flex-shrink: 0;
  border-top: 1px solid var(--border-subtle);
}

.user-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  min-width: 0;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--on-primary);
  background: var(--color-primary);
}

.user-meta {
  min-width: 0;

  strong {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    display: block;
    font-size: 11px;
    color: var(--text-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
  box-shadow: 0 0 0 1.5px var(--sidebar-bg, var(--color-bg-elevated, transparent));
  pointer-events: none;
}

.sidebar:not(.collapsed) .menu-icon-dot {
  display: none;
}

/* 主侧栏选中态：soft accent，贴近 redesign preview */
.app-shell .sidebar .n-menu .n-menu-item-content.n-menu-item-content--selected {
  border-radius: var(--radius-md);
}

.app-shell .sidebar .n-menu .n-menu-item-content.n-menu-item-content--selected::before {
  background: var(--primary-soft) !important;
  inset: 0 4px !important;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.app-shell .sidebar .n-menu .n-menu-item-content:not(.n-menu-item-content--disabled):hover::before {
  border-radius: var(--radius-md);
  inset: 0 4px !important;
}

/* 折叠态约束 menu 宽度：fit-content 会溢出 64px 轨道，导致图标偏离中轴 */
.app-shell .sidebar.collapsed .n-menu {
  width: var(--sidebar-collapsed-width);
}
</style>
