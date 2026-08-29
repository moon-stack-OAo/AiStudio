<script setup>
import {computed} from 'vue'
import {RefreshOutline} from '@vicons/ionicons5'
import {useProviderModels} from '@core/composables/useProviderModels'
import {useSettingsStore} from '@core/stores/settings'
import {useBreakpoints} from '@core/composables/useBreakpoints'
import {useMessage} from 'naive-ui'
import {renderSelectLabel} from '@core/utils/selectRender'

const props = defineProps({
  /** chat | image | video */
  kind: {
    type: String,
    required: true,
  },
  size: {
    type: String,
    default: 'small',
  },
  /** 是否显示刷新按钮 */
  showRefresh: {
    type: Boolean,
    default: true,
  },
  /** sheet 内全宽布局（android 底栏/抽屉） */
  sheet: {
    type: Boolean,
    default: false,
  },
  placeholder: {
    type: String,
    default: '',
  },
})

const settings = useSettingsStore()
const message = useMessage()
const {isMobile} = useBreakpoints()

/** sheet 模式始终尊重 showRefresh；桌面非 sheet 在窄屏隐藏刷新 */
const showRefreshBtn = computed(() => props.showRefresh && (props.sheet || !isMobile.value))

const field = computed(() => {
  if (props.kind === 'image') return 'imageModel'
  if (props.kind === 'video') return 'videoModel'
  return 'chatModel'
})
const value = computed(() => settings.activeProvider?.[field.value] || null)

const {loading, error, options, refresh} = useProviderModels(() => settings.activeProvider, {
  kind: props.kind,
})

const selectPlaceholder = computed(() => {
  if (props.placeholder) return props.placeholder
  if (props.kind === 'image') return '选择生图模型'
  if (props.kind === 'video') return '选择视频模型'
  return '选择对话模型'
})

function onUpdate(v) {
  const p = settings.activeProvider
  if (!p || !v) return
  settings.updateProvider(p.id, {[field.value]: v})
}

async function onRefresh() {
  try {
    await refresh({force: true})
    if (!options.value.length) {
      message.warning(error.value || '未获取到模型列表，可手动输入')
      return
    }
    message.success(`已刷新，共 ${options.value.length} 个可选`)
  } catch (e) {
    message.error(e?.message || '刷新模型失败')
  }
}
</script>

<template>
  <div :class="{sheet}" class="model-select-wrap">
    <n-select
      :loading="loading"
      :options="options"
      :placeholder="selectPlaceholder"
      :render-label="renderSelectLabel"
      :size="size"
      :value="value"
      class="model-select"
      filterable
      tag
      @update:value="onUpdate"
    />
    <n-button
      v-if="showRefreshBtn"
      :loading="loading"
      :size="size"
      aria-label="刷新模型列表"
      circle
      class="touch-target"
      quaternary
      @click="onRefresh"
    >
      <template #icon>
        <n-icon :component="RefreshOutline" />
      </template>
    </n-button>
  </div>
</template>

<style lang="scss" scoped>
.model-select-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;

  &.sheet {
    width: 100%;

    .model-select {
      flex: 1;
      width: 100%;
      min-width: 0;
    }
  }
}

.model-select {
  width: 200px;
  min-width: 140px;
}

@media (max-width: 767.98px) {
  .model-select-wrap:not(.sheet) {
    flex: 1 1 0;
    min-width: 0;
  }

  .model-select-wrap:not(.sheet) .model-select {
    width: 100%;
    min-width: 0;
  }
}
</style>
