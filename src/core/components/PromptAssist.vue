<script setup>
import {computed, toRef} from 'vue'
import {DiceOutline} from '@vicons/ionicons5'
import {useMessage} from 'naive-ui'
import {getPromptPresets, pickRandomPromptPreset} from '@core/prompts'
import {usePromptEnhance} from '@core/composables/usePromptEnhance'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'

const props = defineProps({
  domain: {
    type: String,
    required: true,
    validator: (v) => v === 'video' || v === 'image',
  },
  mode: {type: String, default: ''},
  disabled: {type: Boolean, default: false},
  compact: {type: Boolean, default: false},
  stateKey: {type: String, default: ''},
})

const emit = defineEmits(['apply'])

const message = useMessage()
const {tooltipTrigger} = useTooltipTrigger()
const {enhancing, generateFromLabel, abort} = usePromptEnhance(toRef(props, 'stateKey'))

const presets = computed(() => getPromptPresets(props.domain, props.mode))
const busy = computed(() => enhancing.value)
const chipsDisabled = computed(() => props.disabled || busy.value)

function fallbackPrompt(preset) {
  return String(preset?.prompt || '').trim()
}

function applyFallback(preset, reason) {
  const text = fallbackPrompt(preset)
  if (!text) {
    message.error(reason || '生成失败')
    return false
  }
  emit('apply', text)
  if (reason) message.warning(`${reason}，已填入示例提示词`)
  else message.info('已填入示例提示词')
  return true
}

/**
 * @param {object} preset
 */
async function applyPresetWithAi(preset) {
  if (props.disabled || !preset?.label) return
  if (busy.value) {
    abort()
    message.info('已取消生成')
    return
  }

  try {
    const result = await generateFromLabel(preset, {
      domain: props.domain,
      mode: props.mode || preset.mode,
    })
    if (!result) {
      applyFallback(preset, '生成结果为空')
      return
    }
    emit('apply', result)
    message.success(`已生成「${preset.label}」提示词`)
  } catch (err) {
    if (err?.name === 'AbortError' || err?.message === 'canceled' || err?.message === '已取消') {
      return
    }
    if (err?.name === 'TimeoutError') {
      applyFallback(preset, err.message || '生成超时')
      return
    }
    applyFallback(preset, err?.message || '生成失败')
  }
}

function applyPreset(preset) {
  void applyPresetWithAi(preset)
}

function applyRandom() {
  if (props.disabled) return
  if (busy.value) {
    abort()
    message.info('已取消生成')
    return
  }
  const preset = pickRandomPromptPreset(props.domain, props.mode)
  if (!preset) {
    message.warning('暂无可用示例')
    return
  }
  void applyPresetWithAi(preset)
}
</script>

<template>
  <div v-if="presets.length" :class="{compact}" class="prompt-assist">
    <div class="prompt-assist-scroll">
      <button
        v-for="preset in presets"
        :key="preset.id"
        type="button"
        class="prompt-assist-chip"
        :disabled="chipsDisabled"
        :title="preset.label"
        @click="applyPreset(preset)"
      >
        {{ preset.label }}
      </button>
    </div>
    <n-tooltip :trigger="tooltipTrigger" placement="top">
      <template #trigger>
        <n-button
          :disabled="disabled"
          :aria-label="busy ? '取消生成' : '随机提示词'"
          circle
          class="prompt-assist-random touch-target"
          quaternary
          :size="compact ? 'tiny' : 'small'"
          @click="applyRandom"
        >
          <template #icon>
            <span
              v-if="busy"
              class="prompt-assist-spinner"
              :style="{width: compact ? '14px' : '16px', height: compact ? '14px' : '16px'}"
              aria-hidden="true"
            />
            <n-icon v-else :component="DiceOutline" :size="compact ? 14 : 16" />
          </template>
        </n-button>
      </template>
      {{ busy ? '点击取消生成' : '随机生成提示词' }}
    </n-tooltip>
  </div>
</template>

<style lang="scss" scoped>
.prompt-assist {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 100%;
}

.prompt-assist-scroll {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    height: var(--scrollbar-size);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 999px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  &::-webkit-scrollbar-thumb:active {
    background: var(--scrollbar-thumb-active);
  }
}

.prompt-assist-chip {
  flex-shrink: 0;
  appearance: none;
  border: 1px solid var(--border-muted);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 12px;
  line-height: 1;
  padding: 6px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color 0.15s ease,
    background 0.15s ease,
    border-color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--text-2);
    background: var(--surface-3);
    border-color: color-mix(in srgb, var(--color-primary) 28%, var(--border-muted));
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.prompt-assist-random {
  flex-shrink: 0;
  color: var(--text-3);
}

.prompt-assist-spinner {
  display: inline-block;
  box-sizing: border-box;
  border: 2px solid color-mix(in srgb, currentColor 25%, transparent);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: prompt-assist-spin 0.7s linear infinite;
}

@keyframes prompt-assist-spin {
  to {
    transform: rotate(360deg);
  }
}

.prompt-assist.compact {
  gap: var(--space-1);

  .prompt-assist-scroll {
    gap: 4px;
  }

  .prompt-assist-chip {
    font-size: 11px;
    padding: 4px 8px;
  }
}
</style>
