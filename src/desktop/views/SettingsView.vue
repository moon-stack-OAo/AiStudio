<script setup>
defineOptions({name: 'SettingsView'})

import {computed, ref} from 'vue'
import {AddOutline, RefreshOutline} from '@vicons/ionicons5'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import ProvidersSettings from '@/components/settings/ProvidersSettings.vue'
import AboutSettings from '@/components/settings/AboutSettings.vue'

const {isCompact} = useBreakpoints()
const tabsPlacement = computed(() => (isCompact.value ? 'top' : 'left'))
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
    <div class="header">
      <div class="header-text">
        <div class="title">设置</div>
        <div class="desc">配置接口与模型，数据仅保存在本机</div>
      </div>
      <div v-if="activeTab === 'providers'" class="actions">
        <n-button size="small" quaternary @click="reset">
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
          恢复预设
        </n-button>
        <n-button size="small" type="primary" @click="addCustom">
          <template #icon>
            <n-icon :component="AddOutline" />
          </template>
          添加提供商
        </n-button>
      </div>
    </div>

    <div class="scroll">
      <n-tabs
        v-model:value="activeTab"
        :placement="tabsPlacement"
        class="settings-tabs"
        size="small"
        type="bar"
      >
        <n-tab-pane display-directive="show" name="providers" tab="提供商">
          <ProvidersSettings ref="providersRef" />
        </n-tab-pane>

        <n-tab-pane display-directive="show" name="about" tab="关于与更新">
          <AboutSettings />
        </n-tab-pane>
      </n-tabs>
    </div>
  </div>
</template>

<style lang="scss" scoped src="./SettingsView.scss"></style>
