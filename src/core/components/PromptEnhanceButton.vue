<script setup>
import {computed} from 'vue'
import {SparklesOutline, StopOutline} from '@vicons/ionicons5'
import {useMessage} from 'naive-ui'
import {usePromptEnhance} from '@core/composables/usePromptEnhance'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'

const props = defineProps({
  domain: {
    type: String,
    required: true,
    validator: (v) => v === 'video' || v === 'image',
  },
  mode: {type: String, default: ''},
  text: {type: String, default: ''},
  disabled: {type: Boolean, default: false},
  emptyWarning: {type: String, default: '请先输入提示词'},
  compact: {type: Boolean, default: false},
})

const emit = defineEmits(['apply'])

const message = useMessage()
const {tooltipTrigger} = useTooltipTrigger()
const {enhancing, enhance, abort} = usePromptEnhance()

const tooltipText = computed(() => (enhancing.value ? '点击取消优化' : 'AI 优化提示词'))
const iconSize = computed(() => (props.compact ? 14 : 16))

function onCancel() {
  if (props.disabled) return
  abort()
  message.info('已取消优化')
}

async function onEnhance() {
  if (props.disabled || enhancing.value) return
  const raw = String(props.text || '').trim()
  if (!raw) {
    message.warning(props.emptyWarning)
    return
  }
  try {
    const result = await enhance(raw, {domain: props.domain, mode: props.mode})
    if (!result) return
    emit('apply', result)
    message.success('已优化提示词')
  } catch (err) {
    if (err?.name === 'AbortError' || err?.message === 'canceled' || err?.message === '已取消') {
      return
    }
    if (err?.name === 'TimeoutError') {
      message.error(err.message || '优化超时，请稍后重试')
      return
    }
    message.error(err?.message || '优化失败')
  }
}
</script>

<template>
  <n-tooltip :trigger="tooltipTrigger" placement="top">
    <template #trigger>
      <!-- 取消态不用 loading：Naive UI loading 时不触发 click -->
      <n-button
        v-if="enhancing"
        :aria-label="tooltipText"
        :disabled="disabled"
        class="prompt-enhance-btn touch-target"
        quaternary
        type="warning"
        :size="compact ? 'tiny' : 'small'"
        @click="onCancel"
      >
        <template #icon>
          <n-icon :component="StopOutline" :size="iconSize" />
        </template>
        取消
      </n-button>
      <n-button
        v-else
        :aria-label="tooltipText"
        :disabled="disabled"
        class="prompt-enhance-btn touch-target"
        quaternary
        :size="compact ? 'tiny' : 'small'"
        @click="onEnhance"
      >
        <template #icon>
          <n-icon :component="SparklesOutline" :size="iconSize" />
        </template>
        优化
      </n-button>
    </template>
    {{ tooltipText }}
  </n-tooltip>
</template>

<style lang="scss" scoped>
.prompt-enhance-btn {
  flex-shrink: 0;
  color: var(--text-3);
}
</style>
