<script setup>
import {computed} from 'vue'
import {ChevronDownOutline, RefreshOutline} from '@vicons/ionicons5'
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
  /** 顶栏胶囊触发器皮肤（非 sheet 默认开启） */
  pill: {
    type: Boolean,
    default: undefined,
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

const usePill = computed(() => (props.pill === undefined ? !props.sheet : props.pill))

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
  <div :class="{sheet, pill: usePill}" class="model-select-wrap">
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
    >
      <template v-if="usePill" #arrow>
        <n-icon :component="ChevronDownOutline" :size="14" class="model-pill-caret" />
      </template>
    </n-select>
    <n-button
      v-if="showRefreshBtn"
      :loading="loading"
      :size="size"
      aria-label="刷新模型列表"
      circle
      class="touch-target model-refresh"
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

  &.pill {
    position: relative;

    .model-select {
      width: auto;
      min-width: 0;
      max-width: 220px;
    }

    :deep(.n-base-selection) {
      --n-height: 32px !important;
      --n-border-radius: var(--radius-pill) !important;
      --n-padding-single: 0 28px 0 12px !important;
      height: 32px;
      min-height: 32px;
      border-radius: var(--radius-pill);
      background: var(--color-bg-elevated);
      box-shadow: none;
    }

    :deep(.n-base-selection-label) {
      height: 32px !important;
      padding-left: 12px !important;
      padding-right: 8px !important;
    }

    :deep(.n-base-selection-input) {
      font-size: 13px;
      font-weight: 500;
    }

    :deep(.n-base-selection-tags) {
      padding: 0;
    }

    :deep(.n-base-selection__border),
    :deep(.n-base-selection__state-border) {
      border-radius: var(--radius-pill) !important;
    }

    :deep(.n-base-selection:not(.n-base-selection--disabled):hover) {
      --n-border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--border-muted)) !important;
    }

    :deep(.n-base-suffix) {
      right: 8px;
    }

    .model-pill-caret {
      color: var(--text-3);
    }

    .model-refresh {
      width: 28px;
      height: 28px;
      min-width: 28px;
      opacity: 0.72;
    }
  }
}

.model-select {
  width: 200px;
  min-width: 140px;

  :deep(.n-base-selection) {
    --n-border-radius: var(--radius-pill) !important;
    border-radius: var(--radius-pill);
    background: var(--color-bg-elevated);
    transition:
      border-color var(--motion-fast) var(--ease-standard),
      box-shadow var(--motion-fast) var(--ease-standard);
  }

  :deep(.n-base-selection:not(.n-base-selection--disabled):hover) {
    --n-border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--border-muted)) !important;
  }

  :deep(.n-base-selection-label) {
    padding-left: 12px;
    padding-right: 10px;
  }
}

@media (max-width: 767.98px) {
  .model-select-wrap:not(.sheet) {
    flex: 1 1 0;
    min-width: 0;
  }

  .model-select-wrap:not(.sheet) .model-select {
    width: 100%;
    min-width: 0;
    max-width: none;
  }
}
</style>
