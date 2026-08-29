<script setup>
import {computed} from 'vue'
import {DiceOutline} from '@vicons/ionicons5'
import {getPromptPresets, pickRandomPromptPreset} from '@core/prompts'
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
})

const emit = defineEmits(['apply'])

const {tooltipTrigger} = useTooltipTrigger()

const presets = computed(() => getPromptPresets(props.domain, props.mode))

function applyPreset(preset) {
  if (props.disabled || !preset?.prompt) return
  emit('apply', preset.prompt)
}

function applyRandom() {
  if (props.disabled) return
  const preset = pickRandomPromptPreset(props.domain, props.mode)
  if (preset?.prompt) emit('apply', preset.prompt)
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
        :disabled="disabled"
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
          :aria-label="'随机提示词'"
          circle
          class="prompt-assist-random touch-target"
          quaternary
          :size="compact ? 'tiny' : 'small'"
          @click="applyRandom"
        >
          <template #icon>
            <n-icon :component="DiceOutline" :size="compact ? 14 : 16" />
          </template>
        </n-button>
      </template>
      随机提示词
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
    outline: 2px solid color-mix(in srgb, var(--color-primary) 65%, transparent);
    outline-offset: 1px;
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
