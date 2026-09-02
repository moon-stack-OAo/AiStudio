<script setup>
import {computed} from 'vue'
import {StopOutline} from '@vicons/ionicons5'
import {useTooltipTrigger} from '@core/composables/useTooltipTrigger'

const props = defineProps({
  loading: {type: Boolean, default: false},
  disabled: {type: Boolean, default: false},
  sendIcon: {type: [Object, Function], default: null},
  sendTooltip: {type: String, default: '发送'},
  stopTooltip: {type: String, default: '停止生成'},
  /** desktop 显示 n-tooltip；android 仅 aria-label */
  withTooltip: {type: Boolean, default: false},
  /**
   * circle：圆形图标（兼容旧布局）
   * label：文字主按钮「发送」/ 危险「停止」（Chat / Desktop）
   * gen：约 54×54 圆角实底「生成/提交」（Android Image/Video）
   */
  variant: {
    type: String,
    default: 'circle',
    validator: (v) => ['circle', 'label', 'gen'].includes(v),
  },
  sendLabel: {type: String, default: ''},
  stopLabel: {type: String, default: '停止'},
})

defineEmits(['send', 'stop'])

const {tooltipTrigger} = useTooltipTrigger()

const isCircle = computed(() => props.variant === 'circle')

const resolvedSendLabel = computed(() => {
  if (props.sendLabel) return props.sendLabel
  if (props.variant === 'gen') return '生成'
  return '发送'
})

const btnClass = computed(() => {
  const base = ['composer-send-stop', `is-${props.variant}`]
  if (isCircle.value) base.push('action-btn', 'send-btn', 'touch-target')
  if (props.variant === 'gen') base.push('touch-target')
  return base
})

const sendAria = computed(() => props.sendTooltip || resolvedSendLabel.value)
const stopAria = computed(() => props.stopTooltip || props.stopLabel)
</script>

<template>
  <template v-if="withTooltip">
    <n-tooltip v-if="loading" :trigger="tooltipTrigger" placement="top">
      <template #trigger>
        <n-button
          :aria-label="stopAria"
          :circle="isCircle"
          :class="[...btnClass, 'is-stop']"
          size="medium"
          :type="isCircle ? 'warning' : 'error'"
          @click="$emit('stop')"
        >
          <template v-if="isCircle" #icon>
            <n-icon :component="StopOutline" />
          </template>
          <span v-if="!isCircle">{{ stopLabel }}</span>
        </n-button>
      </template>
      {{ stopTooltip }}
    </n-tooltip>
    <n-tooltip v-else :trigger="tooltipTrigger" placement="top">
      <template #trigger>
        <n-button
          :aria-label="sendAria"
          :circle="isCircle"
          :class="btnClass"
          :disabled="disabled"
          size="medium"
          type="primary"
          @click="$emit('send')"
        >
          <template v-if="isCircle && sendIcon" #icon>
            <n-icon :component="sendIcon" />
          </template>
          <span v-if="!isCircle">{{ resolvedSendLabel }}</span>
        </n-button>
      </template>
      {{ sendTooltip }}
    </n-tooltip>
  </template>
  <template v-else>
    <n-button
      v-if="loading"
      :aria-label="stopAria"
      :circle="isCircle"
      :class="[...btnClass, 'is-stop']"
      size="medium"
      :type="isCircle ? 'warning' : 'error'"
      @click="$emit('stop')"
    >
      <template v-if="isCircle" #icon>
        <n-icon :component="StopOutline" />
      </template>
      <span v-if="!isCircle">{{ stopLabel }}</span>
    </n-button>
    <n-button
      v-else
      :aria-label="sendAria"
      :circle="isCircle"
      :class="btnClass"
      :disabled="disabled"
      size="medium"
      type="primary"
      @click="$emit('send')"
    >
      <template v-if="isCircle && sendIcon" #icon>
        <n-icon :component="sendIcon" />
      </template>
      <span v-if="!isCircle">{{ resolvedSendLabel }}</span>
    </n-button>
  </template>
</template>

<style lang="scss" scoped>
.composer-send-stop.is-label {
  min-width: 64px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-md) !important;
  font-weight: 600;
  box-shadow: none;

  &.is-stop {
    --n-color: color-mix(in srgb, var(--color-danger) 14%, transparent) !important;
    --n-color-hover: color-mix(in srgb, var(--color-danger) 22%, transparent) !important;
    --n-color-pressed: color-mix(in srgb, var(--color-danger) 28%, transparent) !important;
    --n-text-color: var(--color-danger) !important;
    --n-border: 1px solid color-mix(in srgb, var(--color-danger) 45%, transparent) !important;
    --n-border-hover: 1px solid color-mix(in srgb, var(--color-danger) 55%, transparent) !important;
  }
}

.composer-send-stop.is-gen {
  width: 54px;
  height: 54px;
  min-width: 54px;
  min-height: 54px;
  padding: 0;
  border-radius: 18px !important;
  font-weight: 700;
  font-size: 13px;
  line-height: 1.1;
  box-shadow: 0 8px 20px color-mix(in srgb, var(--color-primary) 45%, transparent);

  &.is-stop {
    box-shadow: none;
  }
}
</style>
