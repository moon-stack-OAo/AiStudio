<script setup>
import {computed, toRef} from 'vue'
import {usePromptBuilder} from '@core/composables/usePromptBuilder'
import PromptEnhanceButton from '@core/components/PromptEnhanceButton.vue'

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

const {dimensions, selection, preview, toggleOption, clear} = usePromptBuilder(props.domain, {
  mode: toRef(props, 'mode'),
})

const hasPreview = computed(() => Boolean(String(preview.value || '').trim()))

function isSelected(groupId, optionId) {
  const val = selection[groupId]
  if (Array.isArray(val)) return val.includes(optionId)
  return val === optionId
}

function onChipClick(groupId, optionId) {
  if (props.disabled) return
  toggleOption(groupId, optionId)
}

function onApply() {
  if (props.disabled || !hasPreview.value) return
  emit('apply', preview.value)
}

function onClear() {
  if (props.disabled) return
  clear()
}

function onEnhanceApply(text) {
  emit('apply', text)
}
</script>

<template>
  <div :class="{compact}" class="prompt-builder-panel">
    <div class="prompt-builder-groups">
      <div v-for="group in dimensions" :key="group.id" class="prompt-builder-group">
        <div class="prompt-builder-group-label">{{ group.label }}</div>
        <div class="prompt-builder-chips">
          <button
            v-for="opt in group.options"
            :key="opt.id"
            type="button"
            class="prompt-builder-chip"
            :class="{active: isSelected(group.id, opt.id)}"
            :disabled="disabled"
            :title="opt.label"
            @click="onChipClick(group.id, opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="prompt-builder-preview" :class="{'is-empty': !hasPreview}">
      {{ hasPreview ? preview : '选择上方标签生成草稿' }}
    </div>

    <div class="prompt-builder-actions">
      <n-button
        size="tiny"
        type="primary"
        secondary
        :disabled="disabled || !hasPreview"
        @click="onApply"
      >
        填入输入框
      </n-button>
      <PromptEnhanceButton
        :domain="domain"
        :mode="mode"
        :text="preview"
        :disabled="disabled"
        empty-warning="请先选择标签生成草稿"
        compact
        @apply="onEnhanceApply"
      />
      <n-button size="tiny" quaternary :disabled="disabled" @click="onClear">清空</n-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prompt-builder-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}

.prompt-builder-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.prompt-builder-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.prompt-builder-group-label {
  font-size: 11px;
  line-height: 1;
  color: var(--text-3);
  letter-spacing: 0.02em;
}

.prompt-builder-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.prompt-builder-chip {
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

  &.active:not(:disabled) {
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, var(--surface-2));
    border-color: color-mix(in srgb, var(--color-primary) 45%, var(--border-muted));
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

.prompt-builder-preview {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border-muted);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 4.5em;
  overflow-y: auto;

  &.is-empty {
    color: var(--text-3);
  }
}

.prompt-builder-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.prompt-builder-panel.compact {
  gap: var(--space-1);

  .prompt-builder-groups {
    gap: var(--space-1);
  }

  .prompt-builder-group {
    gap: 4px;
  }

  .prompt-builder-chips {
    gap: 4px;
  }

  .prompt-builder-chip {
    font-size: 11px;
    padding: 4px 8px;
  }

  .prompt-builder-preview {
    font-size: 11px;
    padding: 6px 8px;
  }
}
</style>
