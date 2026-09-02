<script setup>
import {ref} from 'vue'
import {ChevronDownOutline, ChevronUpOutline} from '@vicons/ionicons5'
import PromptBuilderPanel from '@core/components/PromptBuilderPanel.vue'

defineProps({
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

const expanded = ref(false)

function toggle() {
  expanded.value = !expanded.value
}
</script>

<template>
  <div :class="{compact, expanded}" class="prompt-builder-collapse">
    <button type="button" class="prompt-builder-collapse-head" @click="toggle">
      <span class="prompt-builder-collapse-title">结构化提示</span>
      <n-icon
        :component="expanded ? ChevronUpOutline : ChevronDownOutline"
        :size="compact ? 14 : 16"
        class="prompt-builder-collapse-chevron"
      />
    </button>
    <div v-show="expanded" class="prompt-builder-collapse-body">
      <PromptBuilderPanel
        :domain="domain"
        :mode="mode"
        :disabled="disabled"
        :compact="compact"
        @apply="emit('apply', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.prompt-builder-collapse {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border-muted);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  overflow: hidden;
}

.prompt-builder-collapse-head {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  margin: 0;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--surface-2);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.prompt-builder-collapse-title {
  font-size: 12px;
  line-height: 1;
  font-weight: 500;
}

.prompt-builder-collapse-chevron {
  flex-shrink: 0;
  color: var(--text-3);
}

.prompt-builder-collapse-body {
  padding: 10px;
  border-top: 1px solid var(--border-muted);
}

.prompt-builder-collapse.compact {
  .prompt-builder-collapse-head {
    padding: 4px 8px;
  }

  .prompt-builder-collapse-title {
    font-size: 11px;
  }

  .prompt-builder-collapse-body {
    padding: 8px;
  }
}
</style>
