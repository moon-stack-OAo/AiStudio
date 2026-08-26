<script setup>
import {computed, h, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {darkTheme, dateZhCN, NIcon, zhCN} from 'naive-ui'
import {ChatbubblesOutline, ImageOutline, MenuOutline, SettingsOutline,} from '@vicons/ionicons5'
import {useSettingsStore} from '@/stores/settings'
import {useBreakpoints} from '@/composables/useBreakpoints'
import {isTauri} from '@/utils/request'
import TitleBar from '@/components/TitleBar.vue'
import UpdateChecker from '@/components/UpdateChecker.vue'
import CloseConfirm from '@/components/CloseConfirm.vue'
import TrayActionListener from '@/components/TrayActionListener.vue'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const { isMobile, isCompact } = useBreakpoints()
const desktopFrame = isTauri()

const mobileNavShow = ref(false)

const themeOverrides = {
  common: {
    primaryColor: '#7c9cff',
    primaryColorHover: '#9bb2ff',
    primaryColorPressed: '#5f7fe6',
    primaryColorSuppl: '#7c9cff',
    borderRadius: '10px',
    bodyColor: '#0f1115',
    cardColor: 'rgba(16, 18, 24, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
}

function renderIcon(icon) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

const menuOptions = [
  { label: '对话', key: 'chat', icon: renderIcon(ChatbubblesOutline) },
  { label: '生图', key: 'image', icon: renderIcon(ImageOutline) },
  { label: '设置', key: 'settings', icon: renderIcon(SettingsOutline) },
]

const activeKey = computed(() => String(route.name || 'chat'))
const collapsed = computed(() => isCompact.value && !isMobile.value)

watch(
  () => route.fullPath,
  () => {
    mobileNavShow.value = false
  },
)

function onMenuUpdate(key) {
  router.push(`/${key}`)
  mobileNavShow.value = false
}
</script>

<template>
  <n-config-provider
    :date-locale="dateZhCN"
    :locale="zhCN"
    :theme="darkTheme"
    :theme-overrides="themeOverrides"
  >
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <UpdateChecker />
          <TrayActionListener v-if="desktopFrame" />
          <CloseConfirm v-if="desktopFrame" />
          <div
            :class="{ compact: isCompact, mobile: isMobile, framed: desktopFrame }"
            class="app-shell"
          >
            <TitleBar v-if="desktopFrame" />

            <div class="app-body">
              <header v-if="isMobile" class="mobile-topbar">
                <n-button circle quaternary @click="mobileNavShow = true">
                  <template #icon>
                    <n-icon :component="MenuOutline" />
                  </template>
                </n-button>
                <div class="mobile-title">AI Studio</div>
                <n-tag :bordered="false" size="small">
                  {{ settings.activeProvider?.name || '未配置' }}
                </n-tag>
              </header>

              <aside v-if="!isMobile" :class="{ collapsed }" class="sidebar">
                <div class="brand">
                  <div class="logo">AI</div>
                  <div v-if="!collapsed" class="brand-text">
                    <div class="title">AI Studio</div>
                    <div class="sub">对话 · 文生图 · 图生图</div>
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

              <n-drawer
                v-model:show="mobileNavShow"
                :width="260"
                display-directive="show"
                placement="left"
              >
                <n-drawer-content closable title="AI Studio">
                  <n-menu
                    :options="menuOptions"
                    :value="activeKey"
                    @update:value="onMenuUpdate"
                  />
                  <div class="drawer-footer">
                    <div v-if="settings.activeProvider" class="provider-chip">
                      <span class="dot" />
                      <span class="name">{{ settings.activeProvider.name }}</span>
                    </div>
                    <div class="hint">密钥仅保存在本机</div>
                  </div>
                </n-drawer-content>
              </n-drawer>

              <main class="main">
                <router-view />
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
    radial-gradient(1200px 600px at 10% -10%, rgba(124, 156, 255, 0.16), transparent 60%),
    radial-gradient(900px 500px at 100% 0%, rgba(120, 80, 200, 0.12), transparent 55%),
    var(--color-bg);

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

.mobile-topbar {
  flex-shrink: 0;
  height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: rgba(16, 18, 24, 0.9);
}

.mobile-title {
  flex: 1;
  font-weight: 600;
  font-size: 15px;
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
  color: #fff;
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

.sidebar-footer,
.drawer-footer {
  margin-top: auto;
  padding: 12px 10px;
}

.drawer-footer {
  margin-top: 24px;
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
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.7);
}

.provider-chip .name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
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
  height: calc(100% - 52px);
}

@media (max-width: 1279.98px) and (min-width: 768px) {
  .sidebar:not(.collapsed) {
    width: 196px;
  }
}
</style>
