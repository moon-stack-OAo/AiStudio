<script setup>
defineOptions({name: 'SettingsView'})

import {computed, ref} from 'vue'
import {AddOutline, MoonOutline, RefreshOutline, SunnyOutline} from '@vicons/ionicons5'
import {useSettingsStore} from '@core/stores/settings'
import ProvidersSettings from '@/components/settings/ProvidersSettings.vue'
import ChatSettings from '@/components/settings/ChatSettings.vue'
import AppearanceSettings from '@/components/settings/AppearanceSettings.vue'
import AboutSettings from '@/components/settings/AboutSettings.vue'

const settings = useSettingsStore()
const activeTab = ref('providers')
const providersRef = ref(null)
const themeIcon = computed(() => (settings.resolvedTheme === 'light' ? MoonOutline : SunnyOutline))
const themeLabel = computed(() =>
  settings.theme === 'system'
    ? settings.resolvedTheme === 'light'
      ? '跟随系统（浅色）· 切换为深色'
      : '跟随系统（深色）· 切换为浅色'
    : settings.resolvedTheme === 'light'
      ? '切换为深色'
      : '切换为浅色',
)

function reset() {
  providersRef.value?.reset()
}

function addCustom() {
  providersRef.value?.addCustom()
}
</script>

<template>
  <div class="settings-page">
    <div class="page-toolbar">
      <div class="toolbar-title">设置</div>
      <div class="toolbar-actions">
        <n-button
          v-if="activeTab === 'providers'"
          aria-label="恢复预设"
          circle
          class="touch-target"
          quaternary
          @click="reset"
        >
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
        </n-button>
        <n-button
          v-if="activeTab === 'providers'"
          aria-label="添加提供商"
          circle
          class="touch-target"
          quaternary
          @click="addCustom"
        >
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
        </n-button>
        <n-button
          :aria-label="themeLabel"
          circle
          class="touch-target"
          quaternary
          @click="settings.toggleTheme()"
        >
          <template #icon>
            <n-icon :component="themeIcon" />
          </template>
        </n-button>
      </div>
    </div>

    <div class="scroll">
      <n-tabs
        v-model:value="activeTab"
        class="settings-tabs"
        placement="top"
        size="medium"
        type="segment"
      >
        <n-tab-pane display-directive="show" name="providers" tab="提供商">
          <ProvidersSettings ref="providersRef" />
        </n-tab-pane>

        <n-tab-pane display-directive="show" name="chat" tab="对话">
          <ChatSettings />
        </n-tab-pane>

        <n-tab-pane display-directive="show" name="appearance" tab="外观">
          <AppearanceSettings />
        </n-tab-pane>

        <n-tab-pane display-directive="show" name="about" tab="关于">
          <AboutSettings />
        </n-tab-pane>
      </n-tabs>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./SettingsView.scss"></style>
