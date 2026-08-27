<script setup>
import {ref} from 'vue'
import {AddOutline, MoonOutline, RefreshOutline, SunnyOutline} from '@vicons/ionicons5'
import {useSettingsStore} from '@core/stores/settings'
import ProvidersSettings from '@/components/settings/ProvidersSettings.vue'
import AboutSettings from '@/components/settings/AboutSettings.vue'

const settings = useSettingsStore()
const activeTab = ref('providers')
const providersRef = ref(null)

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
            <n-icon :component="RefreshOutline"/>
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
            <n-icon :component="AddOutline"/>
          </template>
        </n-button>
        <n-button
          :aria-label="settings.theme === 'light' ? '切换为深色' : '切换为浅色'"
          circle
          class="touch-target"
          quaternary
          @click="settings.toggleTheme()"
        >
          <template #icon>
            <n-icon :component="settings.theme === 'light' ? MoonOutline : SunnyOutline"/>
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
          <ProvidersSettings ref="providersRef"/>
        </n-tab-pane>

        <n-tab-pane display-directive="show" name="about" tab="关于">
          <AboutSettings/>
        </n-tab-pane>
      </n-tabs>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./SettingsView.scss"></style>
