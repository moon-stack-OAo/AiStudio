<script setup>
import {computed} from 'vue'
import {RefreshOutline} from '@vicons/ionicons5'
import {useProviderModels} from '@/composables/useProviderModels'
import {useSettingsStore} from '@/stores/settings'
import {useMessage} from 'naive-ui'

const props = defineProps({
  /** chat | image */
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
  placeholder: {
    type: String,
    default: '',
  },
})

const settings = useSettingsStore()
const message = useMessage()

const field = computed(() => (props.kind === 'image' ? 'imageModel' : 'chatModel'))
const value = computed(() => settings.activeProvider?.[field.value] || null)

const {
  loading,
  error,
  options,
  refresh,
} = useProviderModels(() => settings.activeProvider, { kind: props.kind })

const selectPlaceholder = computed(
  () => props.placeholder || (props.kind === 'image' ? '选择生图模型' : '选择对话模型'),
)

function onUpdate(v) {
  const p = settings.activeProvider
  if (!p || !v) return
  settings.updateProvider(p.id, { [field.value]: v })
}

async function onRefresh() {
  try {
    await refresh({ force: true })
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
  <div class="model-select-wrap">
    <n-select
      :loading="loading"
      :options="options"
      :placeholder="selectPlaceholder"
      :size="size"
      :value="value"
      class="model-select"
      filterable
      tag
      @update:value="onUpdate"
    />
    <n-button
      v-if="showRefresh"
      :loading="loading"
      :size="size"
      circle
      quaternary
      title="刷新模型列表"
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
}

.model-select {
  width: 200px;
  min-width: 140px;
}
</style>
