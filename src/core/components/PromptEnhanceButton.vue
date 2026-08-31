<script setup>
import {computed} from 'vue'
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
const {enhancing, enhance, abort} = usePromptEnhance()

const tooltipText = computed(() => (enhancing.value ? '点击取消优化' : 'AI 优化提示词'))
const iconSize = computed(() => (props.compact ? 14 : 16))

async function onClick() {
  if (props.disabled) return
  if (enhancing.value) {
    abort()
    message.info('已取消优化')
    return
  }
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
      <!-- 不用 n-button :loading，避免优化中无法点击取消；改为自定义转圈 -->
      <n-button
        :aria-label="tooltipText"
        :disabled="disabled"
        class="prompt-enhance-btn touch-target"
        quaternary
        :size="compact ? 'tiny' : 'small'"
        @click="onClick"
      >
        <template #icon>
          <span
            v-if="enhancing"
            class="prompt-enhance-spinner"
            :style="{width: `${iconSize}px`, height: `${iconSize}px`}"
            aria-hidden="true"
          />
          <n-icon v-else :component="SparklesOutline" :size="iconSize" />
        </template>
        {{ enhancing ? '取消' : '优化' }}
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

.prompt-enhance-spinner {
  display: inline-block;
  box-sizing: border-box;
  border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: prompt-enhance-spin 0.7s linear infinite;
}

@keyframes prompt-enhance-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
