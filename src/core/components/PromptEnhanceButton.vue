<script setup>
import {SparklesOutline} from '@vicons/ionicons5'
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
const {enhancing, enhance} = usePromptEnhance()

async function onClick() {
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
    if (err?.name === 'AbortError' || err?.message === 'canceled') return
    message.error(err?.message || '优化失败')
  }
}
</script>

<template>
  <n-tooltip :trigger="tooltipTrigger" placement="top">
    <template #trigger>
      <n-button
        :disabled="disabled || enhancing"
        :loading="enhancing"
        :aria-label="'AI 优化提示词'"
        class="prompt-enhance-btn touch-target"
        quaternary
        :size="compact ? 'tiny' : 'small'"
        @click="onClick"
      >
        <template #icon>
          <n-icon :component="SparklesOutline" :size="compact ? 14 : 16" />
        </template>
        优化
      </n-button>
    </template>
    AI 优化提示词
  </n-tooltip>
</template>

<style lang="scss" scoped>
.prompt-enhance-btn {
  flex-shrink: 0;
  color: var(--text-3);
}
</style>
